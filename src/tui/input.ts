import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Key } from './terminal.js';
import { setRawBypass } from './terminal.js';
import {
  type AppState,
  type ComposeAction,
  INPUT_MODES,
  OPTIONAL_INPUT,
  OPTIONAL_COMPOSE,
  requestRender,
  notify,
} from './state.js';
import type { TreeNode } from './types/tree.js';
import type { Agent, Session } from '../shared/types.js';
import type { Response } from '../shared/protocol.js';
import { sessionDir, goalPath, roadmapPath, strategyPath } from '../shared/paths.js';
import type { Request } from '../shared/protocol.js';
import { findParentIndex } from './lib/tree.js';

// ── Re-exported types (same definition, no React) ─────────────────────────────

export type LeaderAction =
  | { type: 'enter-copy-menu' }
  | { type: 'copy-path' }
  | { type: 'copy-context' }
  | { type: 'copy-logs' }
  | { type: 'copy-session-id' }
  | { type: 'delete-session' }
  | { type: 'open-logs' }
  | { type: 'open-session-dir' }
  | { type: 'search' }
  | { type: 'jump-to-session'; index: number }
  | { type: 'spawn-agent' }
  | { type: 'message-agent' }
  | { type: 'help' }
  | { type: 'shell-command' }
  | { type: 'jump-to-pane' }
  | { type: 'kill' }
  | { type: 'quit' }
  | { type: 'dismiss' };

export interface KeybindingHandlers {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEnter: () => void;
  onLeft: () => void;
  onRight: () => void;
  onSpace: () => void;
  onTab: () => void;
  onMessage: () => void;
  onGoToWindow: () => void;
  onEditGoal: () => void;
  onNewSession: () => void;
  onClaude: () => void;
  onOpenPlan: () => void;
  onQuit: () => void;
  onReRun: () => void;
  onResume: () => void;
  onContinue: () => void;
  onRestartAgent: () => void;
  onRollback: () => void;
  onToggleLogs: () => void;
  onEdit: () => void;
}

// ── InputActions interface ─────────────────────────────────────────────────────

export interface InputActions {
  // Navigation context (computed by caller, passed in)
  getNodes: () => TreeNode[];
  getCursorNode: () => TreeNode | undefined;
  getAgentForNode: (node: TreeNode | undefined) => Agent | null;

  // Async daemon operations
  sendAndNotify: (request: Request, successMsg: string) => void;
  send: (request: Request) => Promise<Response>;

  // Editor/tmux operations (injected — input.ts must not import these directly)
  openEditorPopup: typeof import('./lib/tmux.js').openEditorPopup;
  editInPopup: typeof import('./lib/tmux.js').editInPopup;
  openCompanionPane: typeof import('./lib/tmux.js').openCompanionPane;
  openClaudeResumePopup: typeof import('./lib/tmux.js').openClaudeResumePopup;
  openClaudeResumeSession: typeof import('./lib/tmux.js').openClaudeResumeSession;
  selectWindow: typeof import('./lib/tmux.js').selectWindow;
  selectPane: typeof import('./lib/tmux.js').selectPane;
  switchToSession: typeof import('./lib/tmux.js').switchToSession;
  openLogPopup: typeof import('./lib/tmux.js').openLogPopup;
  openShellPopup: typeof import('./lib/tmux.js').openShellPopup;
  openInFileManager: typeof import('./lib/tmux.js').openInFileManager;
  copyToClipboard: typeof import('./lib/clipboard.js').copyToClipboard;
  buildSessionContext: typeof import('./lib/context.js').buildSessionContext;

  // Config
  resolveEditor: () => string;

  // Lifecycle
  cleanup: () => void;
}

// ── Neovim bypass helpers ─────────────────────────────────────────────────────

function activateNvimBypass(state: AppState): void {
  setRawBypass((data: string) => {
    // If nvim died, deactivate bypass and let input fall through
    if (!state.nvimBridge?.ready) {
      deactivateNvimBypass();
      state.focusPane = 'tree';
      if (state.mode === 'compose') cancelCompose(state);
      requestRender();
      return false; // not consumed — re-process as normal input
    }
    // Tab (0x09) escapes neovim focus — in compose mode, cancels compose
    if (data === '\t') {
      if (state.mode === 'compose') {
        cancelCompose(state);
        return true;
      }
      deactivateNvimBypass();
      state.focusPane = state.showCombinedView ? 'logs' : 'tree';
      requestRender();
      return true; // consumed, not forwarded to nvim
    }
    // Everything else → neovim
    state.nvimBridge!.write(data);
    return true;
  });
}

function deactivateNvimBypass(): void {
  setRawBypass(null);
}

// ── Compose mode helpers ─────────────────────────────────────────────────────

const COMPOSE_DIR = join(tmpdir(), 'sisyphus-nvim');

/**
 * Enter compose mode: opens a temp file in the nvim detail pane for multi-line input.
 * Returns false if nvim is unavailable (caller should fall back to popup/inline).
 */
function enterComposeMode(state: AppState, action: ComposeAction, actions: InputActions): boolean {
  if (!state.nvimEnabled || !state.nvimBridge?.ready) return false;

  mkdirSync(COMPOSE_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempFile = join(COMPOSE_DIR, `compose-${id}.md`);
  const signalFile = join(COMPOSE_DIR, `compose-signal-${id}`);

  // Create empty temp file
  writeFileSync(tempFile, '', 'utf-8');

  // Save current nvim file key so we can force re-resolution on cancel
  state.composePrevNvimFile = state.prevNvimFile;
  state.composeAction = action;
  state.composeTempFile = tempFile;
  state.composeSignalFile = signalFile;
  state.mode = 'compose';
  state.focusPane = 'detail';

  // Open in nvim
  state.nvimBridge.openComposeFile(tempFile, signalFile);

  // Activate nvim bypass so all input goes to nvim
  activateNvimBypass(state);

  // Start polling for signal file
  state.composePollTimer = setInterval(() => {
    checkComposeSignal(state, actions);
  }, 100);

  requestRender();
  return true;
}

/**
 * Cancel compose mode: clean up and restore previous state.
 */
function cancelCompose(state: AppState): void {
  if (state.composePollTimer !== null) {
    clearInterval(state.composePollTimer);
    state.composePollTimer = null;
  }

  // Clean up temp files
  if (state.composeTempFile) {
    try { unlinkSync(state.composeTempFile); } catch { /* ignore */ }
  }
  if (state.composeSignalFile) {
    try { unlinkSync(state.composeSignalFile); } catch { /* ignore */ }
  }

  // Force nvim to re-resolve files on next render by nulling prevNvimFile
  state.prevNvimFile = null;
  state.composePrevNvimFile = null;
  state.composeAction = null;
  state.composeTempFile = null;
  state.composeSignalFile = null;
  state.mode = 'navigate';
  state.focusPane = 'tree';

  deactivateNvimBypass();
  requestRender();
}

/**
 * Poll for compose signal file. On detection, read content and dispatch action.
 */
function checkComposeSignal(state: AppState, actions: InputActions): void {
  if (!state.composeSignalFile || !state.composeAction) return;

  // Auto-cancel if nvim died
  if (!state.nvimBridge?.ready) {
    cancelCompose(state);
    return;
  }

  if (!existsSync(state.composeSignalFile)) return;

  // Read signal type: "1" = submit, "cancel" = cancel (from :q / QuitPre)
  let signalContent = '';
  try { signalContent = readFileSync(state.composeSignalFile, 'utf-8').trim(); } catch { /* ignore */ }

  if (signalContent === 'cancel') {
    cancelCompose(state);
    return;
  }

  // Signal detected — read compose content
  let content = '';
  if (state.composeTempFile) {
    try { content = readFileSync(state.composeTempFile, 'utf-8').trim(); } catch { /* ignore */ }
  }

  const action = state.composeAction;
  const required = !OPTIONAL_COMPOSE.has(action.kind);

  if (required && !content) {
    // Delete signal file so user can try again
    try { unlinkSync(state.composeSignalFile); } catch { /* ignore */ }
    notify(state, 'Content required');
    return;
  }

  // Dispatch the action
  dispatchComposeAction(action, content, state, actions);

  // Clean up
  cancelCompose(state);
}

/**
 * Map compose action kinds to daemon requests.
 */
function dispatchComposeAction(
  action: ComposeAction,
  content: string,
  state: AppState,
  actions: InputActions,
): void {
  switch (action.kind) {
    case 'new-session':
      actions.sendAndNotify(
        { type: 'start', task: content, cwd: state.cwd },
        'Session created',
      );
      break;

    case 'message-orchestrator':
      actions.sendAndNotify(
        { type: 'message', sessionId: action.sessionId, content },
        'Message queued',
      );
      break;

    case 'resume':
      actions.sendAndNotify(
        { type: 'resume', sessionId: action.sessionId, cwd: state.cwd, message: content || undefined },
        'Session resumed',
      );
      break;

    case 'continue':
      void (async () => {
        try {
          const contRes = await actions.send({ type: 'continue', sessionId: action.sessionId });
          if (!contRes.ok) { notify(state, `Error: ${contRes.error}`); return; }
          actions.sendAndNotify(
            { type: 'resume', sessionId: action.sessionId, cwd: state.cwd, message: content || undefined },
            'Session continued',
          );
        } catch (err) {
          notify(state, `Error: ${(err as Error).message}`);
        }
      })();
      break;

    case 'spawn-agent':
      actions.sendAndNotify(
        {
          type: 'spawn',
          sessionId: action.sessionId,
          agentType: 'default',
          name: 'agent',
          instruction: content,
        },
        'Agent spawned',
      );
      break;

    case 'message-agent':
      actions.sendAndNotify(
        { type: 'message', sessionId: action.sessionId, content, source: { type: 'agent', agentId: action.agentId } },
        `Message sent to ${action.agentId}`,
      );
      break;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function handleCancel(state: AppState): void {
  state.mode = 'navigate';
  state.targetAgentId = null;
  state.inputText = '';
  state.inputCursorPos = 0;
  requestRender();
}

function expandSessionLatestCycle(state: AppState, node: TreeNode): void {
  if (node.type === 'session' && state.selectedSession?.id === node.sessionId) {
    const cycles = state.selectedSession.orchestratorCycles;
    if (cycles.length > 0) {
      const latest = cycles[cycles.length - 1]!;
      state.expanded.add(`cycle:${node.sessionId}:${latest.cycle}`);
    }
  }
}

// ── handleSubmit ──────────────────────────────────────────────────────────────

async function handleSubmit(text: string, state: AppState, actions: InputActions): Promise<void> {
  const selectedSessionId = state.selectedSessionId;

  switch (state.mode) {
    case 'resume': {
      if (!selectedSessionId) break;
      actions.sendAndNotify(
        { type: 'resume', sessionId: selectedSessionId, cwd: state.cwd, message: text || undefined },
        'Session resumed',
      );
      break;
    }

    case 'continue': {
      if (!selectedSessionId) break;
      try {
        const contRes = await actions.send({ type: 'continue', sessionId: selectedSessionId });
        if (!contRes.ok) { notify(state, `Error: ${contRes.error}`); break; }
        actions.sendAndNotify(
          { type: 'resume', sessionId: selectedSessionId, cwd: state.cwd, message: text || undefined },
          'Session continued',
        );
      } catch (err) {
        notify(state, `Error: ${(err as Error).message}`);
      }
      break;
    }

    case 'rollback': {
      if (!selectedSessionId) break;
      const toCycle = parseInt(text, 10);
      if (isNaN(toCycle) || toCycle < 1) { notify(state, 'Invalid cycle number'); break; }
      actions.sendAndNotify(
        { type: 'rollback', sessionId: selectedSessionId, cwd: state.cwd, toCycle },
        `Rolled back to cycle ${toCycle} — use [R]esume to respawn`,
      );
      break;
    }

    case 'delete-confirm': {
      if (!selectedSessionId) break;
      if (text !== 'yes') { notify(state, 'Delete cancelled (type "yes" to confirm)'); break; }
      actions.sendAndNotify(
        { type: 'delete', sessionId: selectedSessionId, cwd: state.cwd },
        'Session deleted',
      );
      break;
    }

    case 'spawn-agent': {
      if (!selectedSessionId) break;
      if (!text.trim()) { notify(state, 'Instruction required'); break; }
      actions.sendAndNotify(
        {
          type: 'spawn',
          sessionId: selectedSessionId,
          agentType: 'default',
          name: 'agent',
          instruction: text,
        },
        'Agent spawned',
      );
      break;
    }

    case 'search': {
      state.searchFilter = text.trim() || null;
      break;
    }

    case 'message-agent': {
      if (!selectedSessionId || !state.targetAgentId) break;
      actions.sendAndNotify(
        { type: 'message', sessionId: selectedSessionId, content: text, source: { type: 'agent', agentId: state.targetAgentId } },
        `Message sent to ${state.targetAgentId}`,
      );
      state.targetAgentId = null;
      break;
    }

    case 'shell-command': {
      if (!text.trim()) break;
      try {
        actions.openShellPopup(state.cwd, text);
      } catch {
        notify(state, 'Failed to run shell command');
      }
      break;
    }
  }

  state.mode = 'navigate';
  state.inputText = '';
  state.inputCursorPos = 0;
  requestRender();
}

// ── handleInputBarKey ─────────────────────────────────────────────────────────

function handleInputBarKey(input: string, key: Key, state: AppState, actions: InputActions): void {
  if (key.return) {
    if (OPTIONAL_INPUT.has(state.mode) || state.inputText.trim()) {
      void handleSubmit(state.inputText.trim(), state, actions);
    }
    return;
  }

  if (key.escape) {
    handleCancel(state);
    return;
  }

  if (key.leftArrow) {
    state.inputCursorPos = Math.max(0, state.inputCursorPos - 1);
    requestRender();
    return;
  }

  if (key.rightArrow) {
    state.inputCursorPos = Math.min(state.inputText.length, state.inputCursorPos + 1);
    requestRender();
    return;
  }

  if (key.ctrl && input === 'a') {
    state.inputCursorPos = 0;
    requestRender();
    return;
  }

  if (key.ctrl && input === 'e') {
    state.inputCursorPos = state.inputText.length;
    requestRender();
    return;
  }

  if (key.ctrl && input === 'k') {
    state.inputText = state.inputText.slice(0, state.inputCursorPos);
    // cursorPos stays the same (now at end)
    requestRender();
    return;
  }

  if (key.ctrl && input === 'u') {
    state.inputText = state.inputText.slice(state.inputCursorPos);
    state.inputCursorPos = 0;
    requestRender();
    return;
  }

  if (key.backspace) {
    if (state.inputCursorPos > 0) {
      state.inputText =
        state.inputText.slice(0, state.inputCursorPos - 1) +
        state.inputText.slice(state.inputCursorPos);
      state.inputCursorPos -= 1;
      requestRender();
    }
    return;
  }

  if (key.delete) {
    if (state.inputCursorPos < state.inputText.length) {
      state.inputText =
        state.inputText.slice(0, state.inputCursorPos) +
        state.inputText.slice(state.inputCursorPos + 1);
      requestRender();
    }
    return;
  }

  if (input && !key.ctrl && !key.meta) {
    state.inputText =
      state.inputText.slice(0, state.inputCursorPos) +
      input +
      state.inputText.slice(state.inputCursorPos);
    state.inputCursorPos += input.length;
    requestRender();
  }
}

// ── handleReportDetailKey ─────────────────────────────────────────────────────

function handleReportDetailKey(input: string, key: Key, state: AppState, actions: InputActions): void {
  if (key.escape || key.return) {
    handleCancel(state);
    return;
  }
  if (key.upArrow) {
    state.detailScroll.scrollBy(-1);
    return;
  }
  if (key.downArrow) {
    state.detailScroll.scrollBy(1);
    return;
  }
}

// ── handleLeaderKey ───────────────────────────────────────────────────────────

function handleLeaderAction(action: LeaderAction, state: AppState, actions: InputActions): void {
  const nodes = actions.getNodes();
  const cursorNode = actions.getCursorNode();
  const session = state.selectedSession;
  const selectedSessionId = state.selectedSessionId;
  const agents = session?.agents ?? [];

  switch (action.type) {
    case 'enter-copy-menu':
      state.mode = 'copy-menu';
      requestRender();
      return;

    case 'copy-path': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      const path = sessionDir(state.cwd, selectedSessionId);
      try {
        actions.copyToClipboard(path);
        notify(state, `Copied path (${path})`);
      } catch {
        notify(state, 'Failed to copy to clipboard');
      }
      break;
    }

    case 'copy-context': {
      if (!selectedSessionId || !session) { notify(state, 'No session selected'); break; }
      try {
        const xml = actions.buildSessionContext(session, state.cwd);
        actions.copyToClipboard(xml);
        notify(state, `Copied context (${xml.length} chars)`);
      } catch {
        notify(state, 'Failed to copy context');
      }
      break;
    }

    case 'copy-logs': {
      if (!state.logsContent) { notify(state, 'No logs content'); break; }
      try {
        actions.copyToClipboard(state.logsContent);
        notify(state, `Copied logs (${state.logsContent.length} chars)`);
      } catch {
        notify(state, 'Failed to copy to clipboard');
      }
      break;
    }

    case 'copy-session-id': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      try {
        actions.copyToClipboard(selectedSessionId);
        notify(state, `Copied session ID (${selectedSessionId})`);
      } catch {
        notify(state, 'Failed to copy to clipboard');
      }
      break;
    }

    case 'delete-session': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      state.mode = 'delete-confirm';
      requestRender();
      return;
    }

    case 'open-logs': {
      try {
        actions.openLogPopup();
      } catch {
        notify(state, 'Failed to open log popup');
      }
      break;
    }

    case 'open-session-dir': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      try {
        actions.openInFileManager(sessionDir(state.cwd, selectedSessionId));
      } catch {
        notify(state, 'Failed to open session directory');
      }
      break;
    }

    case 'search':
      state.mode = 'search';
      requestRender();
      return;

    case 'jump-to-session': {
      let count = 0;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i]?.type === 'session') {
          count++;
          if (count === action.index) {
            state.cursorIndex = i;
            state.cursorNodeId = nodes[i]!.id;
            break;
          }
        }
      }
      break;
    }

    case 'spawn-agent': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      if (enterComposeMode(state, { kind: 'spawn-agent', sessionId: selectedSessionId }, actions)) return;
      // Fallback to inline
      state.mode = 'spawn-agent';
      requestRender();
      return;
    }

    case 'message-agent': {
      const agent = actions.getAgentForNode(cursorNode);
      if (!agent) { notify(state, 'Cursor must be on an agent'); break; }
      if (enterComposeMode(state, { kind: 'message-agent', sessionId: selectedSessionId!, agentId: agent.id }, actions)) return;
      // Fallback to inline
      state.targetAgentId = agent.id;
      state.mode = 'message-agent';
      requestRender();
      return;
    }

    case 'help':
      state.mode = 'help';
      requestRender();
      return;

    case 'shell-command': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      state.mode = 'shell-command';
      requestRender();
      return;
    }

    case 'jump-to-pane': {
      const agent = actions.getAgentForNode(cursorNode);
      if (!agent?.paneId) { notify(state, 'Select an agent with an active pane'); break; }
      if (session?.tmuxSessionName) actions.switchToSession(session.tmuxSessionName);
      if (session?.tmuxWindowId) actions.selectWindow(session.tmuxWindowId);
      actions.selectPane(agent.paneId);
      break;
    }

    case 'kill': {
      if (!selectedSessionId) { notify(state, 'No session selected'); break; }
      const node = nodes[state.cursorIndex];
      if (node && (node.type === 'agent' || node.type === 'report')) {
        const agentId = node.agentId;
        const agent = agents.find((a) => a.id === agentId);
        if (agent?.status !== 'running') { notify(state, `Agent ${agentId} is not running`); break; }
        actions.sendAndNotify({ type: 'kill-agent', sessionId: selectedSessionId, agentId }, `Killed ${agentId}`);
      } else {
        actions.sendAndNotify({ type: 'kill', sessionId: selectedSessionId }, 'Session killed');
      }
      break;
    }

    case 'quit':
      actions.cleanup();
      return;

    case 'dismiss':
      break;
  }

  state.mode = 'navigate';
  requestRender();
}

function handleLeaderKey(input: string, key: Key, state: AppState, actions: InputActions): void {
  if (state.mode === 'leader') {
    if (key.escape) { handleLeaderAction({ type: 'dismiss' }, state, actions); return; }
    if (input === 'y') { handleLeaderAction({ type: 'enter-copy-menu' }, state, actions); return; }
    if (input === 'd') { handleLeaderAction({ type: 'delete-session' }, state, actions); return; }
    if (input === 'l') { handleLeaderAction({ type: 'open-logs' }, state, actions); return; }
    if (input === 'o') { handleLeaderAction({ type: 'open-session-dir' }, state, actions); return; }
    if (input === '/') { handleLeaderAction({ type: 'search' }, state, actions); return; }
    if (input === 'a') { handleLeaderAction({ type: 'spawn-agent' }, state, actions); return; }
    if (input === 'm') { handleLeaderAction({ type: 'message-agent' }, state, actions); return; }
    if (input === '?') { handleLeaderAction({ type: 'help' }, state, actions); return; }
    if (input === '!') { handleLeaderAction({ type: 'shell-command' }, state, actions); return; }
    if (input === 'j') { handleLeaderAction({ type: 'jump-to-pane' }, state, actions); return; }
    if (input === 'k') { handleLeaderAction({ type: 'kill' }, state, actions); return; }
    if (input === 'q') { handleLeaderAction({ type: 'quit' }, state, actions); return; }
    const digit = parseInt(input, 10);
    if (!isNaN(digit) && digit >= 1 && digit <= 9) {
      handleLeaderAction({ type: 'jump-to-session', index: digit }, state, actions);
      return;
    }
    handleLeaderAction({ type: 'dismiss' }, state, actions);
    return;
  }

  if (state.mode === 'copy-menu') {
    if (key.escape) { handleLeaderAction({ type: 'dismiss' }, state, actions); return; }
    if (input === 'p') { handleLeaderAction({ type: 'copy-path' }, state, actions); return; }
    if (input === 'C') { handleLeaderAction({ type: 'copy-context' }, state, actions); return; }
    if (input === 'l') { handleLeaderAction({ type: 'copy-logs' }, state, actions); return; }
    if (input === 's') { handleLeaderAction({ type: 'copy-session-id' }, state, actions); return; }
    handleLeaderAction({ type: 'dismiss' }, state, actions);
    return;
  }

  if (state.mode === 'help') {
    if (key.escape || input === '?') { handleLeaderAction({ type: 'dismiss' }, state, actions); return; }
    // any other key: ignore
  }
}

// ── handleNavigateKey ─────────────────────────────────────────────────────────

function handleNavigateKey(input: string, key: Key, state: AppState, actions: InputActions): void {
  const nodes = actions.getNodes();
  const cursorNode = actions.getCursorNode();
  const session = state.selectedSession;

  // j / ↑
  if (key.upArrow || input === 'k') {
    if (state.focusPane === 'detail') {
      state.detailScroll.scrollBy(-1);
    } else if (state.focusPane === 'logs') {
      state.logsScroll.scrollBy(-1);
    } else {
      state.cursorIndex = Math.max(0, state.cursorIndex - 1);
      state.cursorNodeId = nodes[state.cursorIndex]?.id ?? state.cursorNodeId;
      requestRender();
    }
    return;
  }

  // j / ↓
  if (key.downArrow || input === 'j') {
    if (state.focusPane === 'detail') {
      state.detailScroll.scrollBy(1);
    } else if (state.focusPane === 'logs') {
      state.logsScroll.scrollBy(1);
    } else {
      state.cursorIndex = Math.min(nodes.length - 1, state.cursorIndex + 1);
      state.cursorNodeId = nodes[state.cursorIndex]?.id ?? state.cursorNodeId;
      requestRender();
    }
    return;
  }

  // h / ←
  if (key.leftArrow || input === 'h') {
    if (state.focusPane === 'logs') {
      state.focusPane = 'detail';
      if (state.nvimEnabled && state.nvimBridge?.ready) {
        activateNvimBypass(state);
      }
      requestRender();
      return;
    }
    if (state.focusPane === 'detail') {
      deactivateNvimBypass();
      state.focusPane = 'tree';
      requestRender();
      return;
    }
    const node = nodes[state.cursorIndex];
    if (!node) return;
    if (node.expanded) {
      state.expanded.delete(node.id);
      requestRender();
    } else {
      const parentIdx = findParentIndex(nodes, state.cursorIndex);
      if (parentIdx !== state.cursorIndex) {
        state.cursorIndex = parentIdx;
        state.cursorNodeId = nodes[parentIdx]?.id ?? state.cursorNodeId;
        requestRender();
      }
    }
    return;
  }

  // l / →
  if (key.rightArrow || input === 'l') {
    const node = nodes[state.cursorIndex];
    if (!node) return;
    if (node.expandable && !node.expanded) {
      state.expanded.add(node.id);
      expandSessionLatestCycle(state, node);
      requestRender();
    } else if (node.expandable && node.expanded) {
      // Move cursor to first child
      if (state.cursorIndex + 1 < nodes.length && nodes[state.cursorIndex + 1]!.depth > node.depth) {
        state.cursorIndex += 1;
        state.cursorNodeId = nodes[state.cursorIndex]?.id ?? state.cursorNodeId;
        requestRender();
      }
    }
    return;
  }

  // tab: cycle focus panes
  if (key.tab) {
    if (state.focusPane === 'tree') {
      state.focusPane = 'detail';
      if (state.nvimEnabled && state.nvimBridge?.ready) {
        activateNvimBypass(state);
      }
    } else if (state.focusPane === 'detail') {
      deactivateNvimBypass();
      state.focusPane = state.showCombinedView ? 'logs' : 'tree';
    } else {
      state.focusPane = 'tree';
    }
    requestRender();
    return;
  }

  // space: enter leader mode
  if (input === ' ') {
    state.mode = 'leader';
    requestRender();
    return;
  }

  // enter: expand / report-detail / open context file
  if (key.return) {
    const node = nodes[state.cursorIndex];
    if (!node) return;
    if (node.expandable && !node.expanded) {
      state.expanded.add(node.id);
      expandSessionLatestCycle(state, node);
      requestRender();
    } else if (node.type === 'report') {
      state.targetAgentId = node.agentId;
      state.mode = 'report-detail';
      requestRender();
    } else if (node.type === 'context-file') {
      const editor = actions.resolveEditor();
      try {
        actions.openEditorPopup(state.cwd, editor, node.filePath);
      } catch {
        notify(state, 'Failed to open file in editor');
      }
    }
    return;
  }

  // m: message orchestrator
  if (input === 'm') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    if (enterComposeMode(state, { kind: 'message-orchestrator', sessionId: state.selectedSessionId }, actions)) return;
    // Fallback to popup
    const editor = actions.resolveEditor();
    try {
      const content = actions.editInPopup(state.cwd, editor);
      if (content) {
        actions.sendAndNotify(
          { type: 'message', sessionId: state.selectedSessionId, content },
          'Message queued',
        );
      }
    } catch {
      notify(state, 'Failed to open editor');
    }
    return;
  }

  // w: go to tmux window (or resume orchestrator Claude session if window is dead/completed)
  if (input === 'w') {
    if (!session || !state.selectedSessionId) { notify(state, 'No session selected'); return; }

    // If window is alive, switch to it directly
    if (session.status !== 'completed' && state.paneAlive && session.tmuxWindowId) {
      if (session.tmuxSessionName) actions.switchToSession(session.tmuxSessionName);
      actions.selectWindow(session.tmuxWindowId);
      return;
    }

    // Window is dead or session is completed — resume the last orchestrator Claude session
    const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
    const claudeSessionId = lastCycle?.claudeSessionId;
    if (!claudeSessionId) { notify(state, 'No orchestrator Claude session ID available'); return; }
    try {
      const label = session.name ?? state.selectedSessionId!.slice(0, 8);
      const sessionName = actions.openClaudeResumeSession(state.cwd, claudeSessionId, label);
      actions.switchToSession(sessionName);
    } catch {
      notify(state, 'Failed to open Claude session');
    }
    return;
  }

  // o: open/resume claude session for agent or orchestrator cycle
  if (input === 'o') {
    if (!cursorNode) { notify(state, 'No node selected'); return; }
    let claudeSessionId: string | undefined;
    if (cursorNode.type === 'agent' || cursorNode.type === 'report') {
      const agent = actions.getAgentForNode(cursorNode);
      claudeSessionId = agent?.claudeSessionId ?? undefined;
    } else if (cursorNode.type === 'cycle' && session) {
      const cycle = session.orchestratorCycles.find(c => c.cycle === cursorNode.cycleNumber);
      claudeSessionId = cycle?.claudeSessionId;
    }
    if (!claudeSessionId) { notify(state, 'No Claude session ID available'); return; }
    try {
      actions.openClaudeResumePopup(state.cwd, claudeSessionId);
    } catch {
      notify(state, 'Failed to open Claude session');
    }
    return;
  }

  // g: edit goal
  if (input === 'g') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    const gp = goalPath(state.cwd, state.selectedSessionId);
    const editor = actions.resolveEditor();
    try {
      actions.openEditorPopup(state.cwd, editor, gp, { w: '80', h: '50%' });
    } catch {
      notify(state, `Failed to open goal in ${editor}`);
    }
    return;
  }

  // n: new session
  if (input === 'n') {
    if (enterComposeMode(state, { kind: 'new-session' }, actions)) return;
    // Fallback to popup
    const editor = actions.resolveEditor();
    try {
      const content = actions.editInPopup(state.cwd, editor);
      if (content) {
        actions.sendAndNotify(
          { type: 'start', task: content, cwd: state.cwd },
          'Session created',
        );
      }
    } catch {
      notify(state, 'Failed to open editor');
    }
    return;
  }

  // c: open companion pane
  if (input === 'c') {
    try {
      actions.openCompanionPane(state.cwd);
    } catch {
      notify(state, 'Failed to open companion pane');
    }
    return;
  }

  // p: open plan/roadmap
  if (input === 'p') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    const pp = roadmapPath(state.cwd, state.selectedSessionId);
    const editor = actions.resolveEditor();
    try {
      actions.openEditorPopup(state.cwd, editor, pp);
    } catch {
      notify(state, `Failed to open roadmap in ${editor}`);
    }
    return;
  }

  // q: quit
  if (input === 'q') {
    actions.cleanup();
  }

  // r: re-run agent
  if (input === 'r') {
    const agent = actions.getAgentForNode(cursorNode);
    if (!agent || !state.selectedSessionId) { notify(state, 'Select an agent to re-run'); return; }
    actions.sendAndNotify(
      {
        type: 'spawn',
        sessionId: state.selectedSessionId,
        agentType: agent.agentType,
        name: `${agent.name}-retry`,
        instruction: agent.instruction,
      },
      `Re-spawned ${agent.name}`,
    );
    return;
  }

  // R: enter resume mode
  if (input === 'R') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    if (session?.status === 'active' && state.paneAlive) { notify(state, 'Session already active'); return; }
    if (enterComposeMode(state, { kind: 'resume', sessionId: state.selectedSessionId }, actions)) return;
    // Fallback to inline
    state.mode = 'resume';
    state.inputText = '';
    state.inputCursorPos = 0;
    requestRender();
    return;
  }

  // C: enter continue mode
  if (input === 'C') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    if (session?.status !== 'completed') { notify(state, 'Session not completed'); return; }
    if (enterComposeMode(state, { kind: 'continue', sessionId: state.selectedSessionId }, actions)) return;
    // Fallback to inline
    state.mode = 'continue';
    state.inputText = '';
    state.inputCursorPos = 0;
    requestRender();
    return;
  }

  // x: restart agent
  if (input === 'x') {
    const agent = actions.getAgentForNode(cursorNode);
    if (!agent || !state.selectedSessionId) { notify(state, 'Select an agent to restart'); return; }
    actions.sendAndNotify(
      { type: 'restart-agent', sessionId: state.selectedSessionId, agentId: agent.id },
      `Restarted ${agent.id}`,
    );
    return;
  }

  // b: enter rollback mode — pre-fill with cycle number if cursor is on a cycle node
  if (input === 'b') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    const defaultText = cursorNode?.type === 'cycle' ? String(cursorNode.cycleNumber) : undefined;
    state.mode = 'rollback';
    if (defaultText) {
      state.inputText = defaultText;
      state.inputCursorPos = defaultText.length;
    } else {
      state.inputText = '';
      state.inputCursorPos = 0;
    }
    requestRender();
    return;
  }

  // e: edit context file
  if (input === 'e') {
    if (!cursorNode || cursorNode.type !== 'context-file') return;
    const editor = actions.resolveEditor();
    try {
      actions.openEditorPopup(state.cwd, editor, cursorNode.filePath);
    } catch {
      notify(state, 'Failed to open file in editor');
    }
    return;
  }

  // S: edit strategy
  if (input === 'S') {
    if (!state.selectedSessionId) { notify(state, 'No session selected'); return; }
    const sp = strategyPath(state.cwd, state.selectedSessionId);
    const editor = actions.resolveEditor();
    try {
      actions.openEditorPopup(state.cwd, editor, sp);
    } catch {
      notify(state, `Failed to open strategy in ${editor}`);
    }
    return;
  }

  // t: toggle logs panel
  if (input === 't') {
    if (state.showCombinedView) {
      if (state.focusPane === 'logs') state.focusPane = 'detail';
      state.logsScroll.reset();
    }
    state.showCombinedView = !state.showCombinedView;
    requestRender();
    return;
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

export function handleKeypress(input: string, key: Key, state: AppState, actions: InputActions): void {
  // Compose mode: all input goes through nvim bypass — nothing to handle here
  if (state.mode === 'compose') return;

  if (INPUT_MODES.has(state.mode)) {
    handleInputBarKey(input, key, state, actions);
  } else if (state.mode === 'leader' || state.mode === 'copy-menu' || state.mode === 'help') {
    handleLeaderKey(input, key, state, actions);
  } else if (state.mode === 'report-detail') {
    handleReportDetailKey(input, key, state, actions);
  } else {
    handleNavigateKey(input, key, state, actions);
  }
}
