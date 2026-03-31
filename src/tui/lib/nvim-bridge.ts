import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
  /** DECSCUSR cursor style: 0=default, 1=blinking block, 2=steady block, 3=blinking underline, 4=steady underline, 5=blinking bar, 6=steady bar */
  cursorStyle: number = 0;
  private cachedRows: string[] | null = null;
  private nvimPath: string = 'nvim';
  private pendingFiles: { files: { path: string; readonly: boolean }[]; key: string } | null = null;
  private fileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cmdFile: string;

  constructor(cols: number, rows: number, onRender: () => void) {
    this._cols = cols;
    this._rows = rows;
    this.onRender = onRender;

    // Temp file for passing lua commands to nvim without command-line flash
    const cmdDir = join(tmpdir(), 'sisyphus-nvim');
    mkdirSync(cmdDir, { recursive: true });
    this.cmdFile = join(cmdDir, `cmd-${process.pid}.lua`);

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
  }
}
