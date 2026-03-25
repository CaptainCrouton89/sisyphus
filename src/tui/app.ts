import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
import { createFrameBuffer, flushFrame, writeCenter } from './render.js';
import { writeToStdout, startKeypressListener, onResize } from './terminal.js';
import { buildTree } from './lib/tree.js';
import { resolveReports } from './lib/reports.js';
import { send } from './lib/client.js';
import {
  windowExists,
  openEditorPopup,
  editInPopup,
  openCompanionPane,
  openClaudeResumePopup,
  selectWindow,
  selectPane,
  switchToSession,
  openLogPopup,
  openShellPopup,
  openInFileManager,
} from './lib/tmux.js';
import { copyToClipboard } from './lib/clipboard.js';
import { buildSessionContext } from './lib/context.js';
import { renderTreePanel } from './panels/tree.js';
import { renderDetailContent, renderLogsContent, type DetailContext } from './panels/detail.js';
import { renderNotificationRow, renderInputBar, renderStatusLine } from './panels/bottom.js';
import { renderLeaderOverlay, renderCopyMenuOverlay, renderHelpOverlay } from './panels/overlays.js';
import { loadConfig } from '../shared/config.js';
import { roadmapPath, goalPath, logsDir, contextDir } from '../shared/paths.js';
import type { TreeNode } from './types/tree.js';
import type { Agent, Session } from '../shared/types.js';

// ── Module-level cache for latest rendered nodes (needed by keypress handler) ─

let latestNodes: TreeNode[] = [];

// ── Module-level cache for context file content ───────────────────────────────

let cachedContextFilePath: string | null = null;
let cachedContextFileContent: string | null = null;

// ── Previous frame for diffing ────────────────────────────────────────────────

let prevFrame: string[] = [];

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

  // Track selectedSessionId to detect changes across renders (for immediate poll)
  let prevSelectedSessionId: string | null | undefined = undefined;

  // ── Polling ─────────────────────────────────────────────────────────────────

  async function poll(): Promise<void> {
    try {
      let selectedSession: Session | null = null;
      let planContent = '';
      let goalContent = '';
      let logsContent = '';
      let logsCycles: CycleLog[] = [];
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

      // Cache window existence for non-completed sessions (avoids execSync in render path)
      for (const s of sessions) {
        if (s.status !== 'completed' && s.tmuxWindowId) {
          try {
            s.windowAlive = windowExists(s.tmuxWindowId);
          } catch {
            s.windowAlive = false;
          }
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
          const ld = logsDir(state.cwd, state.selectedSessionId);
          if (existsSync(ld)) {
            const files = readdirSync(ld)
              .filter((f) => f.startsWith('cycle-'))
              .sort();
            logsCycles = files.map((f) => {
              const match = f.match(/cycle-(\d+)\.md$/);
              const cycle = match ? parseInt(match[1]!, 10) : 0;
              const content = readFileSync(join(ld, f), 'utf-8');
              return { cycle, content };
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
      state.goalContent = goalContent;
      state.logsContent = logsContent;
      state.logsCycles = logsCycles;
      state.paneAlive = paneAlive;
      state.contextFiles = contextFiles;
      state.error = null;
      requestRender();
    } catch (err) {
      state.error = (err as Error).message;
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
      prevFrame = [...buf.lines];
      return;
    }

    // Compute layout
    const treeWidth = 36;
    const remaining = state.cols - treeWidth;
    const detailWidth = state.showLogs ? Math.floor(remaining * 0.6) : remaining;
    const logsWidth = state.showLogs ? remaining - detailWidth : 0;
    const contentHeight = state.rows - 3;

    const treeRect = { x: 0, y: 0, w: treeWidth, h: contentHeight };
    const detailRect = { x: treeWidth, y: 0, w: detailWidth, h: contentHeight };
    const logsRect = state.showLogs
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

    const cacheKey = `${state.expanded.size}:${filteredSessions.length}:${state.selectedSession?.id}:${state.contextFiles.length}:${state.searchFilter}`;
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
    }

    // Trigger immediate poll when session changes
    if (state.selectedSessionId !== prevSelectedSessionId) {
      prevSelectedSessionId = state.selectedSessionId;
      if (state.selectedSessionId !== null) {
        void poll();
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

    // Render panels
    renderTreePanel(
      buf,
      treeRect,
      nodes,
      state.cursorIndex,
      state.mode === 'navigate' && state.focusPane === 'tree',
    );

    const detailCtx: DetailContext = {
      nodes,
      session: state.selectedSession,
      agents,
      reportBlocks,
      detailReportBlocks,
      contextFileContent,
    };
    renderDetailContent(buf, detailRect, state, detailCtx);

    if (logsRect) {
      renderLogsContent(buf, logsRect, state);
    }

    // Bottom rows
    renderNotificationRow(buf, bottomY, state.notification, state.error);
    renderInputBar(buf, bottomY + 1, state);
    renderStatusLine(buf, bottomY + 2, state, cursorNode?.type);

    // Overlays (rendered AFTER panels — overwrites panel content)
    if (state.mode === 'leader') renderLeaderOverlay(buf, state.rows, state.cols);
    if (state.mode === 'copy-menu') renderCopyMenuOverlay(buf, state.rows, state.cols);
    if (state.mode === 'help') renderHelpOverlay(buf, state.rows, state.cols);

    // Flush diff to stdout
    const out = flushFrame(buf.lines, prevFrame);
    writeToStdout(out);
    prevFrame = [...buf.lines];
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
    openCompanionPane,
    openClaudeResumePopup,
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

  startKeypressListener((input, key) => {
    handleKeypress(input, key, state, inputActions);
  });

  onResize(() => {
    const stdoutRows = process.stdout.rows;
    const stdoutCols = process.stdout.columns;
    state.rows = (typeof stdoutRows === 'number' && stdoutRows > 0) ? stdoutRows : 24;
    state.cols = (typeof stdoutCols === 'number' && stdoutCols > 0) ? stdoutCols : 80;
    prevFrame = []; // force full redraw
    requestRender();
  });

  // Initial poll + recurring interval
  void poll();
  setInterval(() => void poll(), 2500);

  // Initial render
  requestRender();
}
