import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export class NvimBridge {
  private pty: import('node-pty').IPty | null = null;
  private xterm: import('@xterm/headless').Terminal | null = null;
  private _cols: number;
  private _rows: number;
  private onRender: () => void;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  currentFile: string | null = null;
  ready: boolean = false;
  dirty: boolean = true;
  available: boolean = false;
  respawning: boolean = false;
  /** DECSCUSR cursor style: 0=default, 1=blinking block, 2=steady block, 3=blinking underline, 4=steady underline, 5=blinking bar, 6=steady bar */
  cursorStyle: number = 0;
  private cachedRows: string[] | null = null;
  private nvimPath: string = 'nvim';
  private pendingFiles: { files: { path: string; readonly: boolean }[]; key: string } | null = null;
  private fileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cmdDir: string;
  private cmdFile: string;
  /** Tracked editable files: path → { basePath (snapshot), mtimeMs } */
  private editableFiles: Map<string, { basePath: string; mtimeMs: number }> = new Map();
  private mergeStatusFile: string;

  constructor(cols: number, rows: number, onRender: () => void) {
    this._cols = cols;
    this._rows = rows;
    this.onRender = onRender;

    // Temp file for passing lua commands to nvim without command-line flash
    this.cmdDir = join(tmpdir(), 'sisyphus-nvim');
    mkdirSync(this.cmdDir, { recursive: true });
    this.cmdFile = join(this.cmdDir, `cmd-${process.pid}.lua`);
    this.mergeStatusFile = join(this.cmdDir, `merge-status-${process.pid}.txt`);

    try {
      this.nvimPath = execSync('which nvim', { stdio: 'pipe' }).toString().trim();
      this.available = true;
    } catch {
      this.available = false;
      return;
    }

    this.spawn().catch(() => {
      this.available = false;
      this.ready = false;
    });
  }

  private async spawn(): Promise<void> {
    const { spawn } = await import('node-pty');
    // @xterm/headless is CJS — Terminal lives on the default export when imported from ESM
    const xtermModule = await import('@xterm/headless');
    const { Terminal } = xtermModule.default as typeof import('@xterm/headless');

    this.xterm = new Terminal({
      cols: this._cols,
      rows: this._rows,
      allowProposedApi: true,
    });

    const nvimArgs = [
      // Pre-init: only settings needed before user config loads
      '--cmd',
      [
        'set noswapfile',
        'set nobackup',
        'set nowritebackup',
        'set hidden',
        'set autoread',
      ].join(' | '),
      // Post-init: cosmetic overrides applied AFTER user config (LazyVim, etc.)
      '-c',
      [
        'set laststatus=0',
        'set showtabline=2',
        'set signcolumn=no',
        'set nonumber',
        'set noruler',
        'set noshowcmd',
        'set noshowmode',
        'set shortmess+=F',
        'set fillchars=eob:\\ ',
        'set scrolloff=3',
      ].join(' | '),
      // Suppress LSP — prevent servers from ever starting (avoids exit warnings)
      '--cmd',
      'lua vim.lsp.start = function() end',
      // Poll-based command executor: reads lua from temp file — no command-line flash
      '-c',
      `lua local _t = vim.loop.new_timer(); _t:start(100, 50, vim.schedule_wrap(function() local f = io.open('${this.cmdFile.replace(/'/g, "\\'")}', 'r'); if not f then return end; local c = f:read('*a'); f:close(); os.remove('${this.cmdFile.replace(/'/g, "\\'")}'); if c and #c > 0 then local fn = loadstring(c); if fn then pcall(fn) end end end))`,
    ];

    this.pty = spawn(this.nvimPath, nvimArgs, {
      name: 'xterm-256color',
      cols: this._cols,
      rows: this._rows,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    });

    this.pty.onData((data: string) => {
      // Track DECSCUSR cursor shape sequences (\x1b[N q) so we can
      // forward them to the real terminal alongside cursor positioning
      const csMatch = data.match(/\x1b\[(\d+) q/);
      if (csMatch) this.cursorStyle = parseInt(csMatch[1], 10);

      this.xterm!.write(data);
      this.dirty = true;
      this.cachedRows = null;
      this.debouncedRender();
    });

    this.pty.onExit(() => {
      this.ready = false;
    });

    // Mark ready after nvim + user config have settled
    setTimeout(() => {
      if (this.pty) {
        this.ready = true;
        this.dirty = true;
        this.cachedRows = null;
        this.onRender();
      }
    }, 500);
  }

  /**
   * Respawn nvim after it exited (e.g. user quit during compose).
   * Cleans up dead instances and re-runs spawn().
   */
  async respawn(): Promise<void> {
    if (!this.available) return;
    if (this.xterm) { this.xterm.dispose(); this.xterm = null; }
    if (this.pty) { try { this.pty.kill(); } catch { /* already dead */ } this.pty = null; }
    this.ready = false;
    this.dirty = true;
    this.cachedRows = null;
    this.currentFile = null;
    await this.spawn();
  }

  private debouncedRender(): void {
    if (this.renderTimer !== null) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.onRender();
    }, 16); // ~60fps
  }

  /**
   * Execute lua in nvim without flashing the command line.
   * Writes lua to a temp file — a libuv timer in nvim polls and executes it.
   */
  private execLua(lua: string): void {
    writeFileSync(this.cmdFile, lua);
  }

  openFile(path: string, readonly: boolean = true): void {
    if (!this.pty || !this.ready) return;
    this.currentFile = path;
    const escapeLua = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const ro = readonly ? 'vim.bo.readonly = true; vim.bo.modifiable = false' : 'vim.bo.readonly = false; vim.bo.modifiable = true';
    this.execLua(`vim.cmd('edit! ${escapeLua(path)}'); ${ro}`);
  }

  openTabFiles(files: { path: string; readonly: boolean }[]): void {
    if (!this.pty || !this.ready || files.length === 0) return;
    const key = files.map(f => f.path).join('|');
    // Debounce — only execute after 150ms of no new calls (prevents LSP churn during scroll)
    this.pendingFiles = { files, key };
    if (this.fileDebounceTimer !== null) clearTimeout(this.fileDebounceTimer);
    this.fileDebounceTimer = setTimeout(() => {
      this.fileDebounceTimer = null;
      if (this.pendingFiles) {
        this.executeOpenFiles(this.pendingFiles.files);
        this.currentFile = this.pendingFiles.key;
        this.pendingFiles = null;
      }
    }, 150);
  }

  private executeOpenFiles(files: { path: string; readonly: boolean }[]): void {
    if (!this.pty || !this.ready) return;

    // Snapshot editable files for 3-way merge tracking
    this.trackEditableFiles(files);

    const escapeLua = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const stmts: string[] = [
      'for _, b in ipairs(vim.api.nvim_list_bufs()) do pcall(vim.api.nvim_buf_delete, b, {force=true}) end',
    ];
    for (let i = 0; i < files.length; i++) {
      const path = escapeLua(files[i]!.path);
      stmts.push(i === 0
        ? `vim.cmd('edit! ${path}')`
        : `vim.cmd('edit ${path}')`);
      if (files[i]!.readonly) {
        stmts.push('vim.bo.readonly = true', 'vim.bo.modifiable = false');
      } else {
        stmts.push('vim.bo.readonly = false', 'vim.bo.modifiable = true');
      }
    }
    stmts.push("vim.cmd('bfirst')");
    this.execLua(`(function() ${stmts.join('; ')} end)()`);
  }

  openTabFile(path: string, readonly: boolean): void {
    if (!this.pty || !this.ready) return;
    this.pty.write(`:tabedit ${path}\r`);
    if (readonly) {
      this.pty.write(':setlocal readonly nomodifiable\r');
    } else {
      this.pty.write(':setlocal noreadonly modifiable\r');
    }
  }

  /**
   * Open a temp file for compose mode: clears buffers, opens writable,
   * installs BufWritePost autocmd that writes a signal file on :w,
   * and enters insert mode.
   */
  openComposeFile(tempPath: string, signalPath: string): void {
    if (!this.pty || !this.ready) return;

    // Cancel any pending file debounce (prevents queued openTabFiles from overwriting)
    if (this.fileDebounceTimer !== null) {
      clearTimeout(this.fileDebounceTimer);
      this.fileDebounceTimer = null;
      this.pendingFiles = null;
    }

    const escapeLua = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const eSig = escapeLua(signalPath);
    const lua = [
      // Clear all existing buffers
      'for _, b in ipairs(vim.api.nvim_list_bufs()) do pcall(vim.api.nvim_buf_delete, b, {force=true}) end',
      // Open temp file as writable
      `vim.cmd('edit! ${escapeLua(tempPath)}')`,
      'vim.bo.readonly = false',
      'vim.bo.modifiable = true',
      // Install BufWritePost autocmd — writes submit signal on :w
      `vim.api.nvim_create_autocmd('BufWritePost', { buffer = 0, callback = function() local f = io.open('${eSig}', 'w'); if f then f:write('1'); f:close() end end })`,
      // Install QuitPre autocmd — writes cancel signal if no submit signal exists (quit proceeds, nvim may exit)
      `vim.api.nvim_create_autocmd('QuitPre', { buffer = 0, callback = function() local sf = io.open('${eSig}', 'r'); if sf then sf:close() else local f = io.open('${eSig}', 'w'); if f then f:write('cancel'); f:close() end end end })`,
      // Enter insert mode
      "vim.cmd('startinsert')",
    ].join('; ');
    this.execLua(`(function() ${lua} end)()`);
    this.currentFile = tempPath;
  }

  closeAllTabs(): void {
    if (!this.pty || !this.ready) return;
    this.execLua('for _, b in ipairs(vim.api.nvim_list_bufs()) do pcall(vim.api.nvim_buf_delete, b, {force=true}) end; vim.cmd("enew!")');
    this.currentFile = null;
  }

  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    this.cachedRows = null;
    this.dirty = true;
    if (this.pty) this.pty.resize(cols, rows);
    if (this.xterm) this.xterm.resize(cols, rows);
  }

  write(data: string): void {
    if (this.pty) this.pty.write(data);
  }

  getRows(): string[] {
    if (!this.dirty && this.cachedRows) return this.cachedRows;
    if (!this.xterm) return Array.from({ length: this._rows }, () => ' '.repeat(this._cols));

    const rows: string[] = [];
    const buffer = this.xterm.buffer.active;
    // Reusable cell to avoid per-cell allocation
    const reusableCell = buffer.getNullCell();

    for (let y = 0; y < this._rows; y++) {
      const line = buffer.getLine(y);
      if (!line) {
        rows.push(' '.repeat(this._cols));
        continue;
      }

      let row = '';
      let prevFg: number | undefined = undefined;
      let prevBg: number | undefined = undefined;
      let prevFgMode: 'default' | 'palette' | 'rgb' = 'default';
      let prevBgMode: 'default' | 'palette' | 'rgb' = 'default';
      let prevBold = false;
      let prevDim = false;
      let prevItalic = false;
      let prevUnderline = false;
      let prevInverse = false;
      let hasOpenSGR = false;

      for (let x = 0; x < this._cols; x++) {
        const cell = line.getCell(x, reusableCell);
        if (!cell) {
          row += ' ';
          continue;
        }

        const char = cell.getChars() || ' ';

        const fgDefault = cell.isFgDefault();
        const fgPalette = cell.isFgPalette();
        const fgRGB = cell.isFgRGB();
        const fg = fgDefault ? undefined : cell.getFgColor();
        let fgMode: 'default' | 'palette' | 'rgb';
        if (fgDefault) fgMode = 'default';
        else if (fgPalette) fgMode = 'palette';
        else if (fgRGB) fgMode = 'rgb';
        else throw new Error(`Unknown fg color mode at cell (${x}, ${y})`);

        const bgDefault = cell.isBgDefault();
        const bgPalette = cell.isBgPalette();
        const bgRGB = cell.isBgRGB();
        const bg = bgDefault ? undefined : cell.getBgColor();
        let bgMode: 'default' | 'palette' | 'rgb';
        if (bgDefault) bgMode = 'default';
        else if (bgPalette) bgMode = 'palette';
        else if (bgRGB) bgMode = 'rgb';
        else throw new Error(`Unknown bg color mode at cell (${x}, ${y})`);

        const bold = cell.isBold() !== 0;
        const dim = cell.isDim() !== 0;
        const italic = cell.isItalic() !== 0;
        const underline = cell.isUnderline() !== 0;
        const inverse = cell.isInverse() !== 0;

        const attrChanged =
          fg !== prevFg ||
          bg !== prevBg ||
          fgMode !== prevFgMode ||
          bgMode !== prevBgMode ||
          bold !== prevBold ||
          dim !== prevDim ||
          italic !== prevItalic ||
          underline !== prevUnderline ||
          inverse !== prevInverse;

        if (attrChanged) {
          if (hasOpenSGR) {
            row += '\x1b[0m';
            hasOpenSGR = false;
          }

          const codes: string[] = [];
          if (bold) codes.push('1');
          if (dim) codes.push('2');
          if (italic) codes.push('3');
          if (underline) codes.push('4');
          if (inverse) codes.push('7');

          if (fg !== undefined) {
            if (fgMode === 'palette') {
              codes.push(`38;5;${fg}`);
            } else if (fgMode === 'rgb') {
              const r = (fg >> 16) & 0xff;
              const g = (fg >> 8) & 0xff;
              const b = fg & 0xff;
              codes.push(`38;2;${r};${g};${b}`);
            }
          }

          if (bg !== undefined) {
            if (bgMode === 'palette') {
              codes.push(`48;5;${bg}`);
            } else if (bgMode === 'rgb') {
              const r = (bg >> 16) & 0xff;
              const g = (bg >> 8) & 0xff;
              const b = bg & 0xff;
              codes.push(`48;2;${r};${g};${b}`);
            }
          }

          if (codes.length > 0) {
            row += `\x1b[${codes.join(';')}m`;
            hasOpenSGR = true;
          }

          prevFg = fg;
          prevBg = bg;
          prevFgMode = fgMode;
          prevBgMode = bgMode;
          prevBold = bold;
          prevDim = dim;
          prevItalic = italic;
          prevUnderline = underline;
          prevInverse = inverse;
        }

        row += char;
      }

      if (hasOpenSGR) {
        row += '\x1b[0m';
      }

      rows.push(row);
    }

    this.cachedRows = rows;
    this.dirty = false;
    return rows;
  }

  getCursorPos(): { x: number; y: number } {
    if (!this.xterm) return { x: 0, y: 0 };
    return {
      x: this.xterm.buffer.active.cursorX,
      y: this.xterm.buffer.active.cursorY,
    };
  }

  /**
   * Snapshot editable files on disk so we have a base for 3-way merge.
   * Called when files are opened in nvim tabs.
   */
  private trackEditableFiles(files: { path: string; readonly: boolean }[]): void {
    // Clean up old snapshots
    for (const [, info] of this.editableFiles) {
      try { unlinkSync(info.basePath); } catch { /* ignore */ }
    }
    this.editableFiles.clear();

    for (const file of files) {
      if (file.readonly) continue;
      try {
        const content = readFileSync(file.path, 'utf-8');
        const mtime = statSync(file.path).mtimeMs;
        const basePath = join(this.cmdDir, `base-${simpleHash(file.path)}.md`);
        writeFileSync(basePath, content, 'utf-8');
        this.editableFiles.set(file.path, { basePath, mtimeMs: mtime });
      } catch { /* file may not exist yet */ }
    }
  }

  /**
   * Check editable files for external changes and 3-way merge if the buffer
   * is dirty. Falls back to regular checktime for clean/readonly buffers.
   *
   * Returns a merge status string from the *previous* cycle ('clean' or 'union')
   * if a merge completed, or null.
   */
  mergeCheckOrReload(): string | null {
    if (!this.pty || !this.ready) return null;

    // Read merge status from previous cycle
    let mergeResult: string | null = null;
    try {
      if (existsSync(this.mergeStatusFile)) {
        const content = readFileSync(this.mergeStatusFile, 'utf-8').trim();
        unlinkSync(this.mergeStatusFile);
        if (content) {
          const lines = content.split('\n');
          mergeResult = lines.some(l => l === 'union') ? 'union' : 'clean';
        }
      }
    } catch { /* ignore */ }

    // If a merge just completed, refresh stored mtimes (merge wrote to disk)
    if (mergeResult) {
      for (const [filePath, info] of this.editableFiles) {
        try { info.mtimeMs = statSync(filePath).mtimeMs; } catch { /* ignore */ }
      }
      this.execLua('vim.cmd("checktime")');
      return mergeResult;
    }

    // Check which editable files changed on disk
    const changedFiles: { filePath: string; basePath: string }[] = [];
    for (const [filePath, info] of this.editableFiles) {
      try {
        const currentMtime = statSync(filePath).mtimeMs;
        if (currentMtime !== info.mtimeMs) {
          changedFiles.push({ filePath, basePath: info.basePath });
          info.mtimeMs = currentMtime;
        }
      } catch { /* file gone */ }
    }

    // No editable files changed — regular checktime handles readonly buffers
    if (changedFiles.length === 0) {
      this.execLua('vim.cmd("checktime")');
      return null;
    }

    // Generate Lua: run checktime first (reloads clean buffers), then merge dirty ones
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const mergeBlocks = changedFiles.map(({ filePath, basePath }) => `
    do
      local bufnr = vim.fn.bufnr('${esc(filePath)}')
      if bufnr ~= -1 and vim.api.nvim_buf_is_loaded(bufnr) then
        if vim.bo[bufnr].modified then
          local buf_lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
          local buf_content = table.concat(buf_lines, '\\n') .. '\\n'
          local tmp = '${esc(this.cmdDir)}/merge-current-${process.pid}.md'
          local f = io.open(tmp, 'w')
          if f then f:write(buf_content); f:close() end
          local result = vim.fn.system({'git', 'merge-file', '-p', '--union', tmp, '${esc(basePath)}', '${esc(filePath)}'})
          local merged_lines = vim.split(result, '\\n', {trimempty = false})
          if #merged_lines > 0 and merged_lines[#merged_lines] == '' then
            table.remove(merged_lines)
          end
          vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, merged_lines)
          local out = io.open('${esc(filePath)}', 'w')
          if out then out:write(result); out:close() end
          vim.bo[bufnr].modified = false
          local bf = io.open('${esc(basePath)}', 'w')
          if bf then bf:write(result); bf:close() end
          local sf = io.open('${esc(this.mergeStatusFile)}', 'a')
          if sf then sf:write(vim.v.shell_error == 0 and 'clean' or 'union'); sf:write('\\n'); sf:close() end
        else
          local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
          local bf = io.open('${esc(basePath)}', 'w')
          if bf then bf:write(table.concat(lines, '\\n') .. '\\n'); bf:close() end
        end
      end
    end`).join('\n');

    this.execLua(`(function()
    pcall(function() vim.cmd('checktime') end)
    ${mergeBlocks}
    end)()`);

    return null;
  }

  checktime(): void {
    if (this.pty && this.ready) {
      this.execLua('vim.cmd("checktime")');
    }
  }

  destroy(): void {
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.fileDebounceTimer !== null) {
      clearTimeout(this.fileDebounceTimer);
      this.fileDebounceTimer = null;
    }
    try {
      if (this.pty) {
        this.pty.kill();
        this.pty = null;
      }
    } catch {
      // ignore kill errors
    }
    if (this.xterm) {
      this.xterm.dispose();
      this.xterm = null;
    }
    this.ready = false;
    try { unlinkSync(this.cmdFile); } catch { /* ignore */ }
    try { unlinkSync(this.mergeStatusFile); } catch { /* ignore */ }
    for (const [, info] of this.editableFiles) {
      try { unlinkSync(info.basePath); } catch { /* ignore */ }
    }
    this.editableFiles.clear();
  }
}
