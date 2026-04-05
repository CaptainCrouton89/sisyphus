import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  type AppState,
  type SessionSummary,
  type CycleLog,
  setRenderFunction,
  requestRender,
  stabilizeCursor,
  autoExpandCycle,
  notify,
} from './state.js';
import { handleKeypress, type InputActions } from './input.js';
import { createFrameBuffer, flushFrame, writeCenter, copyRows } from './render.js';
import { writeToStdout, startKeypressListener, onResize } from './terminal.js';
import { buildTree } from './lib/tree.js';
import { precomputePrefixes } from './lib/tree-render.js';
import { resolveReports } from './lib/reports.js';
import { send } from './lib/client.js';
import {
  listAllWindowIds,
  openEditorPopup,
  editInPopup,
  openCompanionPane,
  openClaudeResumePopup,
  openClaudeResumeSession,
  selectWindow,
  selectPane,
  switchToSession,
  openLogPopup,
  openShellPopup,
  openInFileManager,
  promptInPopup,
} from './lib/tmux.js';
import { copyToClipboard } from './lib/clipboard.js';
import { buildSessionContext } from './lib/context.js';
import { renderTreePanel } from './panels/tree.js';
import { renderDetailRows, renderLogsRows, renderDigestRows, type DetailContext } from './panels/detail.js';
import { renderNvimDetailRows } from './panels/nvim-detail.js';
import { renderStatusLine } from './panels/bottom.js';
import { renderLeaderOverlay, renderCopyMenuOverlay, renderHelpOverlay, renderCompanionOverlay, renderCompanionDebugOverlay } from './panels/overlays.js';
import { companionPath } from '../shared/paths.js';
import type { CompanionState } from '../shared/companion-types.js';
import { NvimBridge } from './lib/nvim-bridge.js';
import { resolveNvimFile } from './lib/overview-writer.js';
import { loadConfig } from '../shared/config.js';
import { roadmapPath, goalPath, strategyPath, logsDir, contextDir, digestPath } from '../shared/paths.js';
import { statusIndicator, formatDuration, statusColor, agentStatusIcon, agentDisplayName, truncate, ansiColor, ansiDim, ansiBold } from './lib/format.js';
import { COMPOSE_HEADERS } from './state.js';
import type { TreeNode } from './types/tree.js';
import type { Agent, Session, StatusDigest } from '../shared/types.js';

// ── Module-level companion cache (reloads on mtime change, ~poll interval) ────

let _cachedCompanion: CompanionState | null = null;
let _companionMtime = 0;

function getCompanion(): CompanionState | null {
  try {
    const { mtimeMs } = statSync(companionPath());
    if (_cachedCompanion && mtimeMs === _companionMtime) return _cachedCompanion;
    _companionMtime = mtimeMs;
    _cachedCompanion = JSON.parse(readFileSync(companionPath(), 'utf-8')) as CompanionState;
    return _cachedCompanion;
  } catch {
    return _cachedCompanion;
  }
}

// ── Module-level cache for latest rendered nodes (needed by keypress handler) ─

let latestNodes: TreeNode[] = [];

// ── Module-level cache for context file content ───────────────────────────────

let cachedContextFilePath: string | null = null;
let cachedContextFileContent: string | null = null;

// ── Previous frame for diffing ────────────────────────────────────────────────

let prevFrame: string[] = [];

// ── Panel dirty tracking ─────────────────────────────────────────────────────
// Tracks the inputs that affect each panel. When only the scroll offset changes,
// we can skip re-rendering panels whose inputs haven't changed.

let prevTreeInputs = '';
let prevBottomInputs = '';

// ── Dynamic tree width ──────────────────────────────────────────────────────
// Scale tree panel with terminal width so session names aren't aggressively
// truncated on wide terminals. Min 36 (fits 80-col), max 70.

function computeTreeWidth(cols: number): number {
  return Math.min(70, Math.max(36, Math.floor(cols * 0.25)));
}
let prevOverlayMode = '';
let cachedTreeRows: string[] = [];

// ── Cycle logs cache (avoids re-reading unchanged files every poll) ───────────

let cachedLogSessionId: string | null = null;
let cachedLogFiles: Map<string, { mtime: number; cycle: number; content: string }> = new Map();

// ── Status header constants ──────────────────────────────────────────────────

const STATUS_ROW_COUNT = 2; // Fixed height for status header (avoids nvim resize on cursor change)

function buildStatusRows(
  cursorNode: TreeNode | undefined,
  session: Session | null,
  state: AppState,
): string[] {
  if (!cursorNode || !session) {
    return [ansiDim(' No session selected'), ''];
  }

  const dur = formatDuration(session.createdAt, session.completedAt);
  const indicator = statusIndicator(session.status);
  const sColor = statusColor(session.status);
  const title = truncate(session.name ?? session.task, 40);

  switch (cursorNode.type) {
    case 'session': {
      return [
        ' ' + ansiColor(indicator, sColor, true) + ' ' + ansiColor(title, 'white', true),
        ' ' + ansiDim(`${session.status} · ${session.orchestratorCycles.length} cycles · ${session.agents.length} agents · ${dur}`),
      ];
    }
    case 'cycle': {
      const cycle = session.orchestratorCycles.find(c => c.cycle === cursorNode.cycleNumber);
      if (!cycle) return [' ' + ansiColor(title, 'white', true), ''];
      const cDur = cycle.completedAt ? formatDuration(cycle.timestamp, cycle.completedAt) : 'running';
      const cStatus = cycle.completedAt ? 'completed' : 'running';
      return [
        ' ' + ansiColor(indicator, sColor, true) + ' ' + ansiColor(title, 'white', true) + ansiDim(` · Cycle ${cycle.cycle}`),
        ' ' + ansiDim(`${cStatus} · ${cDur} · ${cycle.agentsSpawned.length} agents`),
      ];
    }
    case 'agent':
    case 'report': {
      const agentId = cursorNode.type === 'agent' ? cursorNode.agentId : cursorNode.agentId;
      const agent = session.agents.find(a => a.id === agentId);
      if (!agent) return [' ' + ansiColor(title, 'white', true), ''];
      const aIcon = agentStatusIcon(agent.status);
      const aDur = formatDuration(agent.spawnedAt, agent.completedAt);
      const aName = agentDisplayName(agent);
      return [
        ' ' + ansiColor(aIcon, statusColor(agent.status === 'running' ? 'active' : agent.status), true) + ' ' + ansiColor(`${agent.id} · ${aName}`, 'white', true),
        ' ' + ansiDim(`${agent.status} · ${agent.agentType || '—'} · ${aDur}`),
      ];
    }
    case 'context-file': {
      const name = cursorNode.filePath.split('/').pop() ?? cursorNode.filePath;
      return [
        ' ' + ansiColor('⊞', 'white') + ' ' + ansiColor(name, 'white', true),
        ' ' + ansiDim(`context file · ${session.status}`),
      ];
    }
    case 'messages':
    case 'message': {
      return [
        ' ' + ansiColor(indicator, sColor, true) + ' ' + ansiColor(title, 'white', true),
        ' ' + ansiDim(`${session.messages.length} messages`),
      ];
    }
    default: {
      return [
        ' ' + ansiColor(indicator, sColor, true) + ' ' + ansiColor(title, 'white', true),
        ' ' + ansiDim(`${session.status} · ${dur}`),
      ];
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAgentForNode(node: TreeNode | undefined, agents: Agent[]): Agent | null {
  if (!node) return null;
  if (node.type === 'agent' || node.type === 'report') {
    return agents.find((a) => a.id === node.agentId) ?? null;
  }
  return null;
}

// ── startApp ──────────────────────────────────────────────────────────────────

export function startApp(state: AppState, cleanup: () => void): void {
  const config = loadConfig(state.cwd);

  // Initialize NvimBridge
  const treeWidth = computeTreeWidth(state.cols);
  const remaining = state.cols - treeWidth;
  const detailW = state.showCombinedView ? Math.floor(remaining * 0.6) : remaining;
  const initialDetailW = detailW - 4; // detail width minus borders
  const initialDetailH = (state.rows - 1) - 2 - STATUS_ROW_COUNT - 1; // content height minus borders, status, separator
  const bridge = new NvimBridge(
    Math.max(1, initialDetailW),
    Math.max(1, initialDetailH),
    requestRender,
  );
  state.nvimBridge = bridge.available ? bridge : null;
  state.nvimEnabled = bridge.available;

  // Track selectedSessionId to detect changes across renders (for immediate poll)
  let prevSelectedSessionId: string | null | undefined = undefined;
  let debouncedPollTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Polling ─────────────────────────────────────────────────────────────────

  async function poll(): Promise<void> {
    try {
      let selectedSession: Session | null = null;
      let planContent = '';
      let strategyContent = '';
      let goalContent = '';
      let logsContent = '';
      let logsCycles: CycleLog[] = [];
      let digestData: StatusDigest | null = null;
      let paneAlive = true;
      let contextFiles: string[] = [];

      const listPromise = send({ type: 'list', cwd: state.cwd });
      const statusPromise = state.selectedSessionId
        ? send({ type: 'status', sessionId: state.selectedSessionId, cwd: state.cwd })
        : null;

      const [listRes, statusRes] = await Promise.all([
        listPromise,
        statusPromise ?? Promise.resolve(null),
      ]);

      const sessions: SessionSummary[] = listRes.ok
        ? ((listRes.data?.sessions as SessionSummary[] | undefined) ?? [])
        : [];

      // Batch-check window existence in a single tmux call
      const aliveWindows = listAllWindowIds();
      for (const s of sessions) {
        if (s.status !== 'completed' && s.tmuxWindowId) {
          s.windowAlive = aliveWindows.has(s.tmuxWindowId);
        }
      }

      if (state.selectedSessionId) {
        if (statusRes?.ok) {
          selectedSession = (statusRes.data?.session as Session | undefined) ?? null;
        }

        // Use cached windowAlive from the session list scan above
        if (selectedSession?.tmuxWindowId) {
          const cached = sessions.find((s) => s.id === state.selectedSessionId);
          paneAlive = cached?.windowAlive ?? false;
        }

        try {
          const pp = roadmapPath(state.cwd, state.selectedSessionId);
          if (existsSync(pp)) {
            planContent = readFileSync(pp, 'utf-8');
          }
        } catch {
          // roadmap.md may not exist yet
        }

        try {
          const gp = goalPath(state.cwd, state.selectedSessionId);
          if (existsSync(gp)) {
            goalContent = readFileSync(gp, 'utf-8');
          }
        } catch {
          // goal.md may not exist yet
        }

        try {
          const sp = strategyPath(state.cwd, state.selectedSessionId);
          if (existsSync(sp)) {
            strategyContent = readFileSync(sp, 'utf-8');
          }
        } catch {
          // strategy.md may not exist yet
        }

        try {
          const ld = logsDir(state.cwd, state.selectedSessionId);
          if (existsSync(ld)) {
            // Reset cache when session changes
            if (state.selectedSessionId !== cachedLogSessionId) {
              cachedLogFiles = new Map();
              cachedLogSessionId = state.selectedSessionId;
            }

            const files = readdirSync(ld)
              .filter((f) => f.startsWith('cycle-'))
              .sort();

            // Remove cache entries for deleted files
            const fileSet = new Set(files);
            for (const key of cachedLogFiles.keys()) {
              if (!fileSet.has(key)) cachedLogFiles.delete(key);
            }

            // Only re-read files whose mtime changed
            for (const f of files) {
              const filePath = join(ld, f);
              const mtime = statSync(filePath).mtimeMs;
              const cached = cachedLogFiles.get(f);
              if (!cached || cached.mtime !== mtime) {
                const match = f.match(/cycle-(\d+)\.md$/);
                const cycle = match ? parseInt(match[1]!, 10) : 0;
                const content = readFileSync(filePath, 'utf-8');
                cachedLogFiles.set(f, { mtime, cycle, content });
              }
            }

            logsCycles = files.map((f) => {
              const entry = cachedLogFiles.get(f)!;
              return { cycle: entry.cycle, content: entry.content };
            });
            logsContent = logsCycles.map((c) => c.content).join('\n');
          }
        } catch {
          // logs may not exist yet
        }

        try {
          const cd = contextDir(state.cwd, state.selectedSessionId);
          if (existsSync(cd)) {
            contextFiles = readdirSync(cd)
              .filter((f) => !f.startsWith('.'))
              .sort();
          }
        } catch {
          // context dir may not exist yet
        }

        try {
          const dp = digestPath(state.cwd, state.selectedSessionId);
          if (existsSync(dp)) {
            const raw = JSON.parse(readFileSync(dp, 'utf-8'));
            if (
              raw &&
              typeof raw.recentWork === 'string' &&
              typeof raw.currentActivity === 'string' &&
              typeof raw.whatsNext === 'string' &&
              Array.isArray(raw.unusualEvents)
            ) {
              digestData = raw as StatusDigest;
            }
          }
        } catch {
          // digest.json may not exist or be malformed
        }
      }

      // Resolve report files in poll (not render) to avoid sync disk reads on keypress
      state.cachedReportBlocks.clear();
      if (selectedSession) {
        for (const agent of selectedSession.agents) {
          state.cachedReportBlocks.set(agent.id, resolveReports(agent.reports));
        }
      }

      state.sessions = sessions;
      state.selectedSession = selectedSession;
      state.planContent = planContent;
      state.strategyContent = strategyContent;
      state.goalContent = goalContent;
      state.logsContent = logsContent;
      state.logsCycles = logsCycles;
      state.digestData = digestData;
      state.paneAlive = paneAlive;
      state.contextFiles = contextFiles;
      state.error = null;

      // Merge-check editable files; falls back to checktime for readonly buffers
      if (state.nvimEnabled && state.nvimBridge?.ready && state.prevNvimFile) {
        const mergeStatus = state.nvimBridge.mergeCheckOrReload();
        if (mergeStatus === 'clean') {
          notify(state, 'Auto-merged external changes');
        } else if (mergeStatus === 'union') {
          notify(state, 'Auto-merged overlapping edits — review buffer');
        }
      }

      requestRender();
    } catch (err) {
      const wasError = state.error !== null;
      state.error = (err as Error).message;
      if (!wasError) prevFrame = []; // force full redraw on error transition
      requestRender();
    }
  }

  // ── Render function ──────────────────────────────────────────────────────────

  function render(): void {
    const stdoutRows = process.stdout.rows;
    const stdoutCols = process.stdout.columns;
    state.rows = (typeof stdoutRows === 'number' && stdoutRows > 0) ? stdoutRows : 24;
    state.cols = (typeof stdoutCols === 'number' && stdoutCols > 0) ? stdoutCols : 80;

    const buf = createFrameBuffer(state.cols, state.rows);

    // Terminal too small
    if (state.cols < 60 || state.rows < 12) {
      writeCenter(buf, Math.floor(state.rows / 2), 'Terminal too small — resize to continue');
      const out = flushFrame(buf.lines, prevFrame);
      writeToStdout(out);
      prevFrame = buf.lines;
      return;
    }

    // Compute layout
    const treeWidth = computeTreeWidth(state.cols);
    const remaining = state.cols - treeWidth;
    const detailWidth = state.showCombinedView ? Math.floor(remaining * 0.6) : remaining;
    const logsWidth = state.showCombinedView ? remaining - detailWidth : 0;
    const contentHeight = state.rows - 1;

    const treeRect = { x: 0, y: 0, w: treeWidth, h: contentHeight };
    const detailRect = { x: treeWidth, y: 0, w: detailWidth, h: contentHeight };
    const logsRect = state.showCombinedView
      ? { x: treeWidth + detailWidth, y: 0, w: logsWidth, h: contentHeight }
      : null;
    const bottomY = contentHeight;

    // Derive data
    const filteredSessions: SessionSummary[] = state.searchFilter
      ? state.sessions.filter((s) => {
          const q = state.searchFilter!.toLowerCase();
          return s.task.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
        })
      : state.sessions;

    const statusFP = filteredSessions.map(s => `${s.status}:${s.windowAlive}:${s.runningAgentCount}`).join(',');
    const cacheKey = `${state.expanded.size}:${filteredSessions.length}:${state.selectedSession?.id}:${state.contextFiles.length}:${state.searchFilter}:${statusFP}`;
    let nodes: TreeNode[];
    if (cacheKey === state.treeCacheKey && state.cachedTreeNodes !== null) {
      nodes = state.cachedTreeNodes;
    } else {
      nodes = buildTree(
        filteredSessions,
        state.selectedSession,
        state.expanded,
        state.cwd,
        state.contextFiles,
      );
      precomputePrefixes(nodes);
      state.cachedTreeNodes = nodes;
      state.treeCacheKey = cacheKey;
    }

    // Cursor stabilization
    stabilizeCursor(state, nodes);

    // Cache latest nodes for keypress handler
    latestNodes = nodes;

    // Track cursor node identity
    const cursorNode = nodes[state.cursorIndex];
    if (cursorNode) state.cursorNodeId = cursorNode.id;

    // Derive selectedSessionId from cursor
    const newSessionId = cursorNode?.sessionId ?? null;
    if (newSessionId !== state.selectedSessionId) {
      state.selectedSessionId = newSessionId;
      state.detailScroll.reset();
      state.logsScroll.reset();
      state.digestScroll.reset();
      state.cachedDetailLines = null;
      state.detailCacheKey = '';
      state.prevNvimFile = null;
      state.cachedLogsLines = null;
      state.logsCacheKey = '';
      state.cachedDigestLines = null;
      state.digestCacheKey = '';
      state.flowExpanded = false;
    }

    // Trigger debounced poll when session changes (avoids poll storm during rapid scrolling)
    if (state.selectedSessionId !== prevSelectedSessionId) {
      prevSelectedSessionId = state.selectedSessionId;
      if (debouncedPollTimer !== null) clearTimeout(debouncedPollTimer);
      if (state.selectedSessionId !== null) {
        debouncedPollTimer = setTimeout(() => {
          debouncedPollTimer = null;
          void poll();
        }, 80);
      }
    }

    // Auto-expand cycle
    autoExpandCycle(state);

    // Resolve reports for detail panel
    const agents = state.selectedSession?.agents ?? [];
    const reportAgent =
      state.mode === 'report-detail' ? getAgentForNode(cursorNode, agents) : null;
    const reportBlocks = reportAgent ? (state.cachedReportBlocks.get(reportAgent.id) ?? []) : [];

    const detailAgent =
      cursorNode?.type === 'agent' || cursorNode?.type === 'report'
        ? getAgentForNode(cursorNode, agents)
        : null;
    const detailReportBlocks = detailAgent
      ? (state.cachedReportBlocks.get(detailAgent.id) ?? [])
      : [];

    // Load context file content (cached to avoid re-read on every render)
    let contextFileContent: string | null = null;
    if (cursorNode?.type === 'context-file') {
      if (cursorNode.filePath !== cachedContextFilePath) {
        cachedContextFilePath = cursorNode.filePath;
        try {
          if (existsSync(cursorNode.filePath)) {
            cachedContextFileContent = readFileSync(cursorNode.filePath, 'utf-8');
          } else {
            cachedContextFileContent = null;
          }
        } catch {
          cachedContextFileContent = null;
        }
      }
      contextFileContent = cachedContextFileContent;
    } else {
      // Clear cache when cursor moves away
      cachedContextFilePath = null;
      cachedContextFileContent = null;
    }

    // Panel dirty tracking — compute fingerprints for each panel's inputs
    const treeFocused = state.mode === 'navigate' && state.focusPane === 'tree';
    const treeInputs = `${state.treeCacheKey}:${state.cursorIndex}:${treeFocused}`;
    const bottomInputs = `${state.notification}:${state.error}:${state.mode}:${state.searchText}:${cursorNode?.type}`;
    const overlayMode = state.mode === 'leader' || state.mode === 'copy-menu' || state.mode === 'help' || state.mode === 'companion-overlay' || state.mode === 'companion-debug' ? state.mode : '';
    let companionFP = '';
    if (state.mode === 'companion-overlay' || state.mode === 'companion-debug') {
      const c = getCompanion();
      const ts = c && c.lastCommentary ? c.lastCommentary.timestamp : '';
      const xp = c ? c.xp : 0;
      const dm = c?.debugMood ? `${c.debugMood.winner}:${c.debugMood.scores[c.debugMood.winner]}` : '';
      companionFP = `${ts}:${xp}:${dm}`;
    }
    const overlayInputs = `${overlayMode}:${companionFP}`;

    const hasPrev = prevFrame.length === buf.height;
    const treeDirty = !hasPrev || treeInputs !== prevTreeInputs;
    const bottomDirty = !hasPrev || bottomInputs !== prevBottomInputs;
    const overlayDirty = !hasPrev || overlayInputs !== prevOverlayMode;

    prevTreeInputs = treeInputs;
    prevBottomInputs = bottomInputs;
    prevOverlayMode = overlayInputs;

    // Render tree into a narrow buffer (treeWidth-wide) so rows are the right size
    // for concatenation. Cached when clean.
    let treeRows: string[];
    if (treeDirty) {
      const treeBlank = ' '.repeat(treeWidth);
      const treeBuf: import('./render.js').FrameBuffer = {
        lines: Array.from({ length: contentHeight }, () => treeBlank),
        width: treeWidth,
        height: contentHeight,
      };
      renderTreePanel(
        treeBuf,
        { x: 0, y: 0, w: treeWidth, h: contentHeight },
        nodes,
        state.cursorIndex,
        treeFocused,
        getCompanion(),
      );
      cachedTreeRows = treeBuf.lines;
      treeRows = treeBuf.lines;
    } else {
      treeRows = cachedTreeRows;
    }

    // Render detail + logs as self-contained row strings, then compose by concatenation.
    // This eliminates all sliceDisplayCols calls — the main scroll bottleneck.
    const detailCtx: DetailContext = {
      nodes,
      session: state.selectedSession,
      agents,
      reportBlocks,
      detailReportBlocks,
      contextFileContent,
    };

    let detailRows: string[];
    const composing = state.mode === 'compose';

    // Auto-respawn nvim if it died (user quit while viewing goal, roadmap, etc.)
    if (state.nvimEnabled && state.nvimBridge && state.nvimBridge.wasReady && !state.nvimBridge.ready && !state.nvimBridge.respawning) {
      state.nvimBridge.respawning = true;
      state.prevNvimFile = null; // force re-resolve after respawn
      state.nvimBridge.respawn().then(() => {
        state.nvimBridge!.respawning = false;
        requestRender();
      }).catch(() => {
        state.nvimBridge!.respawning = false;
        state.nvimEnabled = false;
        requestRender();
      });
    }

    if (state.nvimEnabled && state.nvimBridge?.ready) {
      if (composing) {
        // In compose mode, don't resolve nvim files — nvim is showing the compose temp file
        const action = state.composeAction;
        const label = action ? COMPOSE_HEADERS[action.kind] : 'Compose';
        const statusRows = [
          ' ' + ansiColor(label, 'yellow', true),
          ' ' + ansiDim(':w to submit · Tab to cancel'),
        ];
        detailRows = renderNvimDetailRows(detailRect, state.nvimBridge, true, false, statusRows, true);
      } else {
        // Determine which file(s) neovim should display
        const result = resolveNvimFile(state, cursorNode, detailCtx, state.cwd);
        const resultKey = result ? result.files.map(f => f.path).join('|') : null;
        if (resultKey && resultKey !== state.prevNvimFile) {
          state.nvimBridge.openTabFiles(result!.files);
          state.prevNvimFile = resultKey;
          state.nvimEditable = result!.files.some(f => !f.readonly);
        } else if (!resultKey) {
          state.prevNvimFile = null;
          state.nvimEditable = false;
        }

        // Build status rows for the header
        const statusRows = buildStatusRows(cursorNode, state.selectedSession, state);
        detailRows = renderNvimDetailRows(detailRect, state.nvimBridge, state.focusPane === 'detail', state.nvimEditable, statusRows);
      }
    } else {
      detailRows = renderDetailRows(detailRect, state, detailCtx);
    }
    let rightPanelRows: string[] | null = null;
    if (logsRect) {
      rightPanelRows = state.rightPanelMode === 'logs'
        ? renderLogsRows(logsRect, state)
        : renderDigestRows(logsRect, state);
    }

    // Compose panel rows into buffer by concatenation (no slicing/splicing)
    for (let i = 0; i < contentHeight; i++) {
      if (rightPanelRows) {
        buf.lines[i] = treeRows[i]! + detailRows[i]! + rightPanelRows[i]!;
      } else {
        buf.lines[i] = treeRows[i]! + detailRows[i]!;
      }
    }

    // Bottom row (single status line — notifications replace keybindings transiently)
    if (bottomDirty || overlayDirty) {
      renderStatusLine(buf, bottomY, state, cursorNode?.type);
    } else {
      copyRows(buf, prevFrame, bottomY, 1);
    }

    // Overlays (rendered AFTER panels — overwrites panel content)
    if (overlayMode) {
      if (state.mode === 'leader') renderLeaderOverlay(buf, state.rows, state.cols);
      if (state.mode === 'copy-menu') renderCopyMenuOverlay(buf, state.rows, state.cols);
      if (state.mode === 'help') renderHelpOverlay(buf, state.rows, state.cols);
      if (state.mode === 'companion-overlay') {
        const companion = getCompanion();
        if (companion) renderCompanionOverlay(buf, state.rows, state.cols, companion);
      }
      if (state.mode === 'companion-debug') {
        const companion = getCompanion();
        if (companion) renderCompanionDebugOverlay(buf, state.rows, state.cols, companion);
      }
    }

    // Build cursor suffix inside synchronized output block to prevent flicker
    let cursorSuffix: string;
    if (state.focusPane === 'detail' && state.nvimBridge?.ready) {
      const cursor = state.nvimBridge.getCursorPos();
      const absX = detailRect.x + 2 + cursor.x;
      // Nvim content starts after: top border (1) + status rows (STATUS_ROW_COUNT) + separator (1)
      const absY = detailRect.y + 1 + STATUS_ROW_COUNT + 1 + cursor.y;
      cursorSuffix = `\x1b[${state.nvimBridge.cursorStyle} q\x1b[?25h\x1b[${absY + 1};${absX + 1}H`;
    } else {
      cursorSuffix = '\x1b[0 q\x1b[?25l';
    }

    // Flush diff to stdout with cursor positioning inside sync block
    const out = flushFrame(buf.lines, prevFrame, cursorSuffix);
    writeToStdout(out);
    prevFrame = buf.lines;
  }

  // ── InputActions ─────────────────────────────────────────────────────────────

  const inputActions: InputActions = {
    getNodes: () => latestNodes,
    getCursorNode: () => latestNodes[state.cursorIndex],
    getAgentForNode: (node) => {
      const agents = state.selectedSession?.agents ?? [];
      return getAgentForNode(node, agents);
    },
    sendAndNotify: (request, successMsg) => {
      void send(request)
        .then((res) => {
          if (res.ok) {
            notify(state, successMsg);
          } else {
            const errMsg = res.error ? res.error : 'Unknown error';
            notify(state, `Error: ${errMsg}`);
          }
        })
        .catch((err: Error) => {
          notify(state, `Error: ${err.message}`);
        });
    },
    send,
    openEditorPopup,
    editInPopup,
    promptInPopup,
    openCompanionPane,
    openClaudeResumePopup,
    openClaudeResumeSession,
    selectWindow,
    selectPane,
    switchToSession,
    openLogPopup,
    openShellPopup,
    openInFileManager,
    copyToClipboard,
    buildSessionContext,
    resolveEditor: () => {
      if (config.editor) return config.editor;
      if (process.env.EDITOR) return process.env.EDITOR;
      return 'nvim';
    },
    cleanup: () => {
      cleanup();
      process.exit(0);
    },
  };

  // ── Wire everything together ─────────────────────────────────────────────────

  setRenderFunction(render);

  const stopKeypress = startKeypressListener((input, key) => {
    handleKeypress(input, key, state, inputActions);
  });

  const stopResize = onResize(() => {
    const stdoutRows = process.stdout.rows;
    const stdoutCols = process.stdout.columns;
    state.rows = (typeof stdoutRows === 'number' && stdoutRows > 0) ? stdoutRows : 24;
    state.cols = (typeof stdoutCols === 'number' && stdoutCols > 0) ? stdoutCols : 80;
    prevFrame = []; // force full redraw

    // Resize nvim bridge to match new detail panel dimensions
    // Account for: combined view split, borders (2), status rows (STATUS_ROW_COUNT), separator (1)
    if (state.nvimBridge) {
      const resizeRemaining = state.cols - computeTreeWidth(state.cols);
      const resizeDetailW = state.showCombinedView ? Math.floor(resizeRemaining * 0.6) : resizeRemaining;
      const contentH = state.rows - 1; // bottomBar=1
      state.nvimBridge.resize(Math.max(1, resizeDetailW - 4), Math.max(1, contentH - 2 - STATUS_ROW_COUNT - 1));
    }

    requestRender();
  });

  // Initial poll + recurring interval
  void poll();
  const pollInterval = setInterval(() => void poll(), 2500);

  // Register teardown so cleanup() releases all resources
  const origCleanup = inputActions.cleanup;
  inputActions.cleanup = () => {
    clearInterval(pollInterval);
    if (debouncedPollTimer !== null) clearTimeout(debouncedPollTimer);
    if (state.composePollTimer !== null) clearInterval(state.composePollTimer);
    stopKeypress();
    stopResize();
    state.detailScroll.destroy();
    state.logsScroll.destroy();
    state.digestScroll.destroy();
    state.nvimBridge?.destroy();
    origCleanup();
  };

  // Initial render
  requestRender();
}
