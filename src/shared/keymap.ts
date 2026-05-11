export type KeyMap = {
  version: 1;
  topLevel: MenuDef;
  submenus: Record<string, MenuDef>;
};

export type MenuDef = {
  title: string;
  items: MenuItem[];
};

export type MenuItem = {
  key: string;
  label: string;
  action: Action;
  tuiAction?: string;
  hidden?: boolean;
};

export type Action =
  | { type: 'submenu'; ref: string }
  | { type: 'script'; name: string }
  | { type: 'popup'; name: string; popup: PopupOpts }
  | { type: 'tmux'; cmd: string }
  | { type: 'tui'; action: string };

export type PopupOpts = {
  w?: string;
  h?: string;
  borderStyle?: string;
  title?: string;
  cwd?: 'current';
};

export function formatHelpForKeymap(km: KeyMap): string {
  const COL1 = 20;
  const MAX_W = 78;

  function shortLabel(raw: string, max: number): string {
    return raw.trimStart()
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s+--\S*/g, '')
      .trimEnd()
      .slice(0, max)
      .trimEnd();
  }

  const lines: string[] = [];

  lines.push('  Sisyphus Keybindings  (Ctrl-s + key)');
  lines.push('');
  lines.push('  ── Direct ─────────────────────────────────');

  for (const item of km.topLevel.items) {
    if (item.action.type === 'submenu' || item.action.type === 'tui' || item.hidden) continue;
    const key = item.key.trim() === '' ? 'spc' : item.key;
    lines.push(`    ${key.padEnd(4)} ${shortLabel(item.label, 30)}`);
  }

  lines.push('');
  lines.push('  ── Submenus ───────────────────────────────');

  for (const topItem of km.topLevel.items) {
    if (topItem.action.type !== 'submenu') continue;
    const { ref } = topItem.action;
    const sub = km.submenus[ref];
    if (!sub) continue;

    const prefix = topItem.key;
    const col1Text = `    ${prefix} › ${sub.title.trim()}`.padEnd(COL1);
    let cur = col1Text;

    for (const si of sub.items) {
      const lbl = shortLabel(si.label, 13);
      const tok = `${prefix} ${si.key} ${lbl}`;
      const sep = cur.length === COL1 ? '' : '  ';
      if (cur.length !== COL1 && cur.length + 2 + tok.length > MAX_W) {
        lines.push(cur);
        cur = ' '.repeat(COL1) + tok;
      } else {
        cur += sep + tok;
      }
    }
    if (cur.length > COL1) lines.push(cur);
  }

  return lines.join('\n');
}

// Maps TUI overlay mode → KEYMAP menu key. Shared between input dispatcher and renderer.
export const MENU_FOR_MODE: Record<string, string | undefined> = {
  'leader':            'topLevel',
  'copy-menu':         'copy',
  'open-menu':         'open',
  'agent-menu':        'agent',
  'session-menu':      'session',
  'go-menu':           'go',
  'companion-menu':    'companion',
};

export const KEYMAP: KeyMap = {
  version: 1,
  topLevel: {
    title: ' Sisyphus ',
    items: [
      { key: 's', label: '  Cycle session', action: { type: 'script', name: 'sisyphus-cycle' } },
      { key: 'h', label: '  Home / dashboard', action: { type: 'script', name: 'sisyphus-home' } },
      { key: 'n', label: '  New session', action: { type: 'popup', name: 'sisyphus-new', popup: { w: '80%', h: '60%', cwd: 'current' } } },
      { key: 'm', label: '  Message orchestrator', action: { type: 'popup', name: 'sisyphus-msg', popup: { w: '80%', h: '60%', cwd: 'current' } } },
      { key: 't', label: '  Status (where am I?)', action: { type: 'popup', name: 'sisyphus-status-popup', popup: { w: '90%', h: '90%', cwd: 'current' } } },
      { key: 'l', label: '  Session picker', action: { type: 'popup', name: 'sisyphus-pick-session', popup: { w: '60%', h: '60%', cwd: 'current' } } },
      { key: 'z', label: '  Zoom pane', action: { type: 'tmux', cmd: 'resize-pane -Z' } },
      { key: 'x', label: '  Kill pane (smart)', action: { type: 'script', name: 'sisyphus-kill-pane' } },
      { key: '?', label: '  Full help reference', action: { type: 'popup', name: 'sisyphus-help', popup: { w: '80', h: '32', title: ' Keybindings ' } } },
      { key: '/', label: '  Search / filter', action: { type: 'script', name: 'sisyphus-search-reports' }, tuiAction: 'search' },
      { key: ' ', label: '  Open popup explicitly', action: { type: 'tui', action: 'show-leader' } },
      { key: 'y', label: '  Yank ›', action: { type: 'submenu', ref: 'copy' } },
      { key: 'c', label: '  Side claude pane', action: { type: 'script', name: 'sisyphus-companion-pane' }, tuiAction: 'companion-pane' },
      { key: 'C', label: '  Companion (gamification) ›', action: { type: 'submenu', ref: 'companion' } },
      { key: 'o', label: '  Open ›', action: { type: 'submenu', ref: 'open' } },
      { key: 'a', label: '  Agent ›', action: { type: 'submenu', ref: 'agent' } },
      { key: 'S', label: '  Session ›', action: { type: 'submenu', ref: 'session' } },
      { key: 'g', label: '  Go ›', action: { type: 'submenu', ref: 'go' } },
    ],
  },
  submenus: {
    companion: {
      title: ' Companion ',
      items: [
        { key: 'p', label: '  profile (overlay)',    action: { type: 'tui', action: 'companion-overlay' } },
        { key: 'd', label: '  debug (mood signals)', action: { type: 'tui', action: 'companion-debug' } },
      ],
    },
    copy: {
      title: ' Copy ',
      items: [
        { key: 'p', label: '  session dir path', action: { type: 'script', name: 'sisyphus-copy-path' } },
        { key: 'i', label: '  session UUID', action: { type: 'script', name: 'sisyphus-copy-id' } },
        { key: 'c', label: '  full session context XML', action: { type: 'script', name: 'sisyphus-copy-context' } },
        { key: 'l', label: '  logs (last 200 lines)', action: { type: 'script', name: 'sisyphus-copy-logs' } },
        { key: 'r', label: '  latest report content', action: { type: 'script', name: 'sisyphus-copy-latest-report' } },
        { key: 'a', label: '  agent ID (picker)', action: { type: 'script', name: 'sisyphus-copy-agent-id' } },
      ],
    },
    open: {
      title: ' Open ',
      items: [
        { key: 'g', label: '  goal.md', action: { type: 'popup', name: 'sisyphus-open-goal', popup: { w: '95%', h: '95%', cwd: 'current' } } },
        { key: 'r', label: '  roadmap.md', action: { type: 'popup', name: 'sisyphus-open-roadmap', popup: { w: '95%', h: '95%', cwd: 'current' } } },
        { key: 's', label: '  strategy.md', action: { type: 'popup', name: 'sisyphus-open-strategy', popup: { w: '95%', h: '95%', cwd: 'current' } } },
        { key: 'l', label: '  logs popup (tail)', action: { type: 'popup', name: 'sisyphus-open-logs', popup: { w: '90%', h: '90%', cwd: 'current' } } },
        { key: 'd', label: '  session dir in file mgr', action: { type: 'script', name: 'sisyphus-open-dir' } },
        { key: 'R', label: '  latest report file', action: { type: 'popup', name: 'sisyphus-open-latest-report', popup: { w: '95%', h: '95%', cwd: 'current' } } },
        { key: 'c', label: '  scratch', action: { type: 'popup', name: 'sisyphus-open-scratch', popup: { w: '95%', h: '95%', cwd: 'current' } } },
        { key: 'e', label: '  edit context file', action: { type: 'popup', name: 'sisyphus-edit-context-file', popup: { w: '95%', h: '95%', cwd: 'current' } }, tuiAction: 'edit-context-file' },
      ],
    },
    agent: {
      title: ' Agent ',
      items: [
        { key: 's', label: '  spawn agent', action: { type: 'popup', name: 'sisyphus-spawn-agent', popup: { w: '80%', h: '70%', cwd: 'current' } } },
        { key: 'm', label: '  message agent (picker)', action: { type: 'popup', name: 'sisyphus-msg-agent', popup: { w: '80%', h: '60%', cwd: 'current' } } },
        { key: 'r', label: '  restart agent (picker)', action: { type: 'popup', name: 'sisyphus-restart-agent-popup', popup: { w: '70%', h: '50%', cwd: 'current' } } },
        { key: 'R', label: '  re-run agent (picker)', action: { type: 'popup', name: 'sisyphus-rerun-agent', popup: { w: '70%', h: '50%', cwd: 'current' } } },
        { key: 'j', label: "  jump to agent's pane", action: { type: 'popup', name: 'sisyphus-jump-to-pane', popup: { w: '60%', h: '60%' } } },
        { key: 'o', label: '  open claude --resume', action: { type: 'popup', name: 'sisyphus-open-claude-agent', popup: { w: '60%', h: '60%', cwd: 'current' } } },
        { key: 't', label: '  tail agent logs (picker)', action: { type: 'popup', name: 'sisyphus-tail-agent-logs', popup: { w: '90%', h: '90%', cwd: 'current' } } },
        { key: 'k', label: '  kill agent (picker)', action: { type: 'popup', name: 'sisyphus-kill-agent', popup: { w: '60%', h: '40%', cwd: 'current' } } },
        { key: 'e', label: '  quick-spawn Explore', action: { type: 'script', name: 'sisyphus-quick-spawn-explore' } },
        { key: 'd', label: '  quick-spawn Debug', action: { type: 'script', name: 'sisyphus-quick-spawn-debug' } },
      ],
    },
    session: {
      title: ' Session ',
      items: [
        { key: 'n', label: '  new session', action: { type: 'popup', name: 'sisyphus-new', popup: { w: '80%', h: '60%', cwd: 'current' } } },
        { key: 'r', label: '  resume', action: { type: 'popup', name: 'sisyphus-resume-session', popup: { w: '80%', h: '60%', cwd: 'current' } } },
        { key: 'c', label: '  continue', action: { type: 'popup', name: 'sisyphus-continue-session', popup: { w: '50', h: '5', borderStyle: 'fg=yellow', title: ' Continue Session ', cwd: 'current' } } },
        { key: 'b', label: '  rollback (prompts cycle)', action: { type: 'popup', name: 'sisyphus-rollback-session', popup: { w: '50', h: '5', title: ' Rollback ', cwd: 'current' } } },
        { key: 'k', label: '  kill', action: { type: 'popup', name: 'sisyphus-kill-session', popup: { w: '40', h: '5', borderStyle: 'fg=red', title: ' Kill Session ', cwd: 'current' } } },
        { key: 'd', label: '  delete (confirms)', action: { type: 'popup', name: 'sisyphus-delete-session', popup: { w: '40', h: '5', borderStyle: 'fg=red', title: ' Delete Session ', cwd: 'current' } } },
        { key: 'e', label: '  export to ~/Downloads', action: { type: 'popup', name: 'sisyphus-export-session', popup: { w: '60', h: '8', title: ' Export Session ', cwd: 'current' } } },
        { key: 'w', label: '  go to session window', action: { type: 'popup', name: 'sisyphus-go-to-window', popup: { w: '70%', h: '60%', cwd: 'current' } } },
        { key: 'C', label: '  clone (sisyphus session clone)', action: { type: 'popup', name: 'sisyphus-clone-session', popup: { w: '60%', h: '60%', cwd: 'current' } } },
        { key: 'i', label: '  history', action: { type: 'popup', name: 'sisyphus-history', popup: { w: '95%', h: '95%', cwd: 'current' } } },
      ],
    },
    go: {
      title: ' Go ',
      items: [
        { key: 'w', label: '  go to session window', action: { type: 'popup', name: 'sisyphus-go-to-window', popup: { w: '70%', h: '60%', cwd: 'current' } } },
        { key: 'p', label: '  jump to pane (picker)', action: { type: 'popup', name: 'sisyphus-jump-to-pane', popup: { w: '60%', h: '60%' } } },
        { key: 's', label: '  session picker', action: { type: 'popup', name: 'sisyphus-pick-session', popup: { w: '60%', h: '60%', cwd: 'current' } } },
        { key: 'n', label: '  next session', action: { type: 'script', name: 'sisyphus-cycle' } },
        { key: 'r', label: '  reconnect', action: { type: 'popup', name: 'sisyphus-reconnect', popup: { w: '80%', h: '40%', cwd: 'current' } } },
      ],
    },
  },
};
