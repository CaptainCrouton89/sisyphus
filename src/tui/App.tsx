import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import { SessionTree } from './components/SessionTree.js';
import { SessionDetail } from './components/SessionDetail.js';
import { LogsPanel } from './components/LogsPanel.js';
import { CycleDetail } from './components/CycleDetail.js';
import { AgentDetail } from './components/AgentDetail.js';
import { ReportView } from './components/ReportView.js';
import { InputBar, type InputMode } from './components/InputBar.js';
import { StatusLine } from './components/StatusLine.js';
import { LeaderOverlay } from './components/LeaderOverlay.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { usePolling } from './hooks/usePolling.js';
import { useKeybindings } from './hooks/useKeybindings.js';
import { useLeaderKey } from './hooks/useLeaderKey.js';
import { send } from './lib/client.js';
import { resolveReports } from './lib/reports.js';
import { copyToClipboard } from './lib/clipboard.js';
import { buildSessionContext } from './lib/context.js';
import { buildTree, findParentIndex } from './lib/tree.js';
import {
  openCompanionPane,
  openEditorPopup,
  editInPopup,
  selectWindow,
  selectPane,
  switchToSession,
  openLogPopup,
  openShellPopup,
  openInFileManager,
} from './lib/tmux.js';
import { ScrollablePanel } from './components/ScrollablePanel.js';
import { wrapText, formatTime, cleanMarkdown, stripFrontmatter, seg, singleLine, type DetailLine } from './lib/format.js';
import { goalPath, roadmapPath, sessionDir } from '../shared/paths.js';
import { readFileSync, existsSync } from 'node:fs';
import { loadConfig } from '../shared/config.js';
import type { Request } from '../shared/protocol.js';
import type { TreeNode } from './types/tree.js';

interface Props {
  cwd: string;
}

function resolveEditor(configEditor: string | undefined): string {
  if (configEditor) return configEditor;
  if (process.env.EDITOR) return process.env.EDITOR;
  return 'nvim';
}

export function App({ cwd }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const cols = stdout.columns || 80;
  const config = loadConfig(cwd);

  // Tree state
  const [cursorIndex, setCursorIndex] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<InputMode>('navigate');
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);
  const [logsScrollOffset, setLogsScrollOffset] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [focusPane, setFocusPane] = useState<'tree' | 'detail' | 'logs'>('tree');
  const [searchFilter, setSearchFilter] = useState<string | null>(null);
  const [targetAgentId, setTargetAgentId] = useState<string | null>(null);
  const cursorNodeIdRef = useRef<string | null>(null);
  const prevNodesRef = useRef<TreeNode[]>([]);

  // Polling
  const { sessions, selectedSession, planContent, goalContent, logsContent, logsCycles, paneAlive, contextFiles, error } = usePolling(cwd, selectedSessionId);

  // Filter sessions for search
  const filteredSessions = useMemo(() => {
    if (!searchFilter) return sessions;
    const q = searchFilter.toLowerCase();
    return sessions.filter(
      (s) => s.task.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [sessions, searchFilter]);

  // Build tree from current state
  const nodes = useMemo(
    () => buildTree(filteredSessions, selectedSession, expanded, cwd, contextFiles),
    [filteredSessions, selectedSession, expanded, cwd, contextFiles],
  );

  // Track cursor node identity: update ref only when cursor moved (nodes stable),
  // not when tree rebuilt (nodes changed underneath)
  if (nodes === prevNodesRef.current) {
    const node = nodes[cursorIndex];
    if (node) cursorNodeIdRef.current = node.id;
  } else if (cursorNodeIdRef.current === null && nodes.length > 0) {
    cursorNodeIdRef.current = nodes[0]?.id ?? null;
  }
  prevNodesRef.current = nodes;

  // Derive selectedSessionId from cursor position
  useEffect(() => {
    const node = nodes[cursorIndex];
    const id = node?.sessionId ?? null;
    if (id !== selectedSessionId) {
      setSelectedSessionId(id);
    }
  }, [nodes, cursorIndex, selectedSessionId]);

  // Reset scroll offsets when cursor changes
  useEffect(() => {
    setDetailScrollOffset(0);
    setLogsScrollOffset(0);
  }, [cursorIndex]);

  // Stabilize cursor position when tree structure changes
  useEffect(() => {
    if (nodes.length === 0) {
      setCursorIndex(0);
      return;
    }
    const targetId = cursorNodeIdRef.current;
    if (!targetId) {
      cursorNodeIdRef.current = nodes[0]?.id ?? null;
      return;
    }
    // If current index already points to the right node, no adjustment needed
    if (nodes[cursorIndex]?.id === targetId) return;

    // Find the tracked node in the new tree
    const newIndex = nodes.findIndex((n) => n.id === targetId);
    if (newIndex !== -1) {
      setCursorIndex(newIndex);
    } else {
      // Node is gone (parent collapsed, session removed, etc.) — clamp
      const clamped = Math.min(cursorIndex, nodes.length - 1);
      setCursorIndex(clamped);
      cursorNodeIdRef.current = nodes[clamped]?.id ?? null;
    }
  }, [nodes]);

  // Auto-expand latest cycle when session data loads (only if session already expanded)
  const prevCycleCountRef = useRef<number>(0);
  useEffect(() => {
    if (!selectedSession) return;
    const sessionNodeId = `session:${selectedSession.id}`;
    const cycles = selectedSession.orchestratorCycles;

    setExpanded((prev) => {
      // Only auto-manage cycle expansion if the session is already expanded by user
      if (!prev.has(sessionNodeId)) {
        prevCycleCountRef.current = cycles.length;
        return prev;
      }
      if (cycles.length === 0) {
        prevCycleCountRef.current = 0;
        return prev;
      }

      const latest = cycles[cycles.length - 1]!;
      const latestId = `cycle:${selectedSession.id}:${latest.cycle}`;

      let next = prev;
      if (cycles.length > prevCycleCountRef.current && prevCycleCountRef.current > 0) {
        // New cycle appeared — collapse previous, expand latest
        const prevCycle = cycles[cycles.length - 2];
        if (prevCycle) {
          const prevId = `cycle:${selectedSession.id}:${prevCycle.cycle}`;
          next = new Set(prev);
          next.delete(prevId);
          next.add(latestId);
        }
      } else if (!prev.has(latestId)) {
        // Ensure latest is expanded
        next = new Set(prev);
        next.add(latestId);
      }

      prevCycleCountRef.current = cycles.length;
      return next;
    });
  }, [selectedSession?.orchestratorCycles.length, selectedSession?.id]);

  // Clear notification
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(t);
  }, [notification]);

  const notify = useCallback((msg: string) => setNotification(msg), []);

  const session = selectedSession;
  const agents = session?.agents ?? [];

  // Helper: get the current cursor node
  const cursorNode: TreeNode | undefined = nodes[cursorIndex];

  // Helper: find agent object for agent/report nodes
  const getAgentForNode = useCallback(
    (node: TreeNode | undefined) => {
      if (!node || !session) return null;
      if (node.type === 'agent') return agents.find((a) => a.id === node.agentId) ?? null;
      if (node.type === 'report') return agents.find((a) => a.id === node.agentId) ?? null;
      return null;
    },
    [session, agents],
  );

  // Send request and notify result
  const sendAndNotify = useCallback(
    async (request: Request, successMsg: string) => {
      try {
        const res = await send(request);
        notify(res.ok ? successMsg : `Error: ${res.error}`);
      } catch (err) {
        notify(`Error: ${(err as Error).message}`);
      }
    },
    [notify],
  );

  // Expand/collapse helpers
  const toggleExpand = useCallback(
    (nodeId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    },
    [],
  );

  const expandNode = useCallback(
    (nodeId: string) => {
      setExpanded((prev) => {
        if (prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });
    },
    [],
  );

  const collapseNode = useCallback(
    (nodeId: string) => {
      setExpanded((prev) => {
        if (!prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    },
    [],
  );

  // Layout — fixed-width tree panel (computed early for keybinding handlers)
  const treeWidth = 36;
  const remainingWidth = cols - treeWidth;
  const detailWidth = showLogs ? Math.floor(remainingWidth * 0.6) : remainingWidth;
  const logsWidth = showLogs ? remainingWidth - detailWidth : 0;
  const contentHeight = rows - 3;

  // Keybindings (only active in navigate mode)
  useKeybindings(
    {
      onMoveUp: () => {
        if (focusPane === 'detail') {
          setDetailScrollOffset((o) => Math.max(0, o - 1));
        } else if (focusPane === 'logs') {
          setLogsScrollOffset((o) => Math.max(0, o - 1));
        } else {
          setCursorIndex((i) => Math.max(0, i - 1));
        }
      },
      onMoveDown: () => {
        if (focusPane === 'detail') {
          setDetailScrollOffset((o) => o + 1);
        } else if (focusPane === 'logs') {
          setLogsScrollOffset((o) => o + 1);
        } else {
          setCursorIndex((i) => Math.min(nodes.length - 1, i + 1));
        }
      },
      onLeft: () => {
        if (focusPane === 'logs') {
          setFocusPane('detail');
          return;
        }
        if (focusPane === 'detail') {
          setFocusPane('tree');
          return;
        }
        const node = nodes[cursorIndex];
        if (!node) return;
        if (node.expanded) {
          collapseNode(node.id);
        } else {
          // Jump to parent
          const parentIdx = findParentIndex(nodes, cursorIndex);
          if (parentIdx !== cursorIndex) setCursorIndex(parentIdx);
        }
      },
      onRight: () => {
        const node = nodes[cursorIndex];
        if (!node) return;
        if (node.expandable && !node.expanded) {
          expandNode(node.id);
          // Convenience: expanding a session also expands its latest cycle
          if (node.type === 'session' && selectedSession?.id === node.sessionId) {
            const cycles = selectedSession.orchestratorCycles;
            if (cycles.length > 0) {
              const latest = cycles[cycles.length - 1]!;
              expandNode(`cycle:${node.sessionId}:${latest.cycle}`);
            }
          }
        } else if (node.expandable && node.expanded) {
          // Move cursor to first child
          if (cursorIndex + 1 < nodes.length && nodes[cursorIndex + 1]!.depth > node.depth) {
            setCursorIndex(cursorIndex + 1);
          }
        }
      },
      onTab: () => {
        setFocusPane((f) => {
          if (f === 'tree') return 'detail';
          if (f === 'detail') return showLogs ? 'logs' : 'tree';
          return 'tree';
        });
      },
      onToggleLogs: () => {
        setShowLogs((prev) => {
          if (prev) {
            // Hiding: move focus away from logs if needed
            setFocusPane((f) => (f === 'logs' ? 'detail' : f));
            setLogsScrollOffset(0);
          }
          return !prev;
        });
      },
      onSpace: () => {
        setMode('leader');
      },
      onEnter: () => {
        const node = nodes[cursorIndex];
        if (!node) return;
        if (node.expandable && !node.expanded) {
          expandNode(node.id);
          // Convenience: expanding a session also expands its latest cycle
          if (node.type === 'session' && selectedSession?.id === node.sessionId) {
            const cycles = selectedSession.orchestratorCycles;
            if (cycles.length > 0) {
              const latest = cycles[cycles.length - 1]!;
              expandNode(`cycle:${node.sessionId}:${latest.cycle}`);
            }
          }
        } else if (node.type === 'report') {
          setMode('report-detail');
        } else if (node.type === 'context-file') {
          const editor = resolveEditor(config.editor);
          try {
            openEditorPopup(cwd, editor, node.filePath);
          } catch {
            notify('Failed to open file in editor');
          }
        }
      },
      onMessage: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        const editor = resolveEditor(config.editor);
        try {
          const content = editInPopup(cwd, editor);
          if (content) {
            void sendAndNotify(
              { type: 'message', sessionId: selectedSessionId, content },
              'Message queued',
            );
          }
        } catch {
          notify('Failed to open editor');
        }
      },
      // kill moved to leader menu (space k)
      onGoToWindow: () => {
        if (!session?.tmuxWindowId) { notify('No tmux window'); return; }
        if (session.tmuxSessionName) switchToSession(session.tmuxSessionName);
        selectWindow(session.tmuxWindowId);
      },
      onEditGoal: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        const gp = goalPath(cwd, selectedSessionId);
        const editor = resolveEditor(config.editor);
        try {
          openEditorPopup(cwd, editor, gp, { w: '80', h: '50%' });
        } catch {
          notify(`Failed to open goal in ${editor}`);
        }
      },
      onNewSession: () => {
        const editor = resolveEditor(config.editor);
        try {
          const content = editInPopup(cwd, editor);
          if (content) {
            void sendAndNotify(
              { type: 'start', task: content, cwd },
              'Session created',
            );
          }
        } catch {
          notify('Failed to open editor');
        }
      },
      onClaude: () => {
        try {
          openCompanionPane(cwd);
        } catch {
          notify('Failed to open companion pane');
        }
      },
      onOpenPlan: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        const pp = roadmapPath(cwd, selectedSessionId);
        const editor = resolveEditor(config.editor);
        try {
          openEditorPopup(cwd, editor, pp);
        } catch {
          notify(`Failed to open roadmap in ${editor}`);
        }
      },
      onQuit: () => exit(),
      onReRun: () => {
        const agent = getAgentForNode(cursorNode);
        if (!agent || !selectedSessionId) { notify('Select an agent to re-run'); return; }
        sendAndNotify({
          type: 'spawn',
          sessionId: selectedSessionId,
          agentType: agent.agentType,
          name: `${agent.name}-retry`,
          instruction: agent.instruction,
        }, `Re-spawned ${agent.name}`);
      },
      // jump-to-pane moved to leader menu (space j)
      onResume: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        if (session?.status === 'active' && paneAlive) { notify('Session already active'); return; }
        setMode('resume');
      },
      onContinue: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        if (session?.status !== 'completed') { notify('Session not completed'); return; }
        setMode('continue');
      },
      onRestartAgent: () => {
        const agent = getAgentForNode(cursorNode);
        if (!agent || !selectedSessionId) { notify('Select an agent to restart'); return; }
        sendAndNotify(
          { type: 'restart-agent', sessionId: selectedSessionId, agentId: agent.id },
          `Restarted ${agent.id}`,
        );
      },
      onRollback: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        setMode('rollback');
      },
      onEdit: () => {
        if (!cursorNode || cursorNode.type !== 'context-file') return;
        const editor = resolveEditor(config.editor);
        try {
          openEditorPopup(cwd, editor, cursorNode.filePath);
        } catch {
          notify('Failed to open file in editor');
        }
      },
    },
    mode === 'navigate',
  );

  // Leader key state machine
  useLeaderKey(mode, (action) => {
    switch (action.type) {
      case 'enter-copy-menu':
        setMode('copy-menu');
        break;

      case 'copy-path': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        const path = sessionDir(cwd, selectedSessionId);
        try {
          copyToClipboard(path);
          notify(`Copied path (${path})`);
        } catch {
          notify('Failed to copy to clipboard');
        }
        setMode('navigate');
        break;
      }

      case 'copy-context': {
        if (!selectedSessionId || !session) { notify('No session selected'); setMode('navigate'); break; }
        try {
          const xml = buildSessionContext(session, cwd);
          copyToClipboard(xml);
          notify(`Copied context (${xml.length} chars)`);
        } catch {
          notify('Failed to copy context');
        }
        setMode('navigate');
        break;
      }

      case 'copy-logs': {
        if (!logsContent) { notify('No logs content'); setMode('navigate'); break; }
        try {
          copyToClipboard(logsContent);
          notify(`Copied logs (${logsContent.length} chars)`);
        } catch {
          notify('Failed to copy to clipboard');
        }
        setMode('navigate');
        break;
      }

      case 'copy-session-id': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        try {
          copyToClipboard(selectedSessionId);
          notify(`Copied session ID (${selectedSessionId})`);
        } catch {
          notify('Failed to copy to clipboard');
        }
        setMode('navigate');
        break;
      }

      case 'delete-session': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        setMode('delete-confirm');
        break;
      }

      case 'open-logs': {
        try {
          openLogPopup();
        } catch {
          notify('Failed to open log popup');
        }
        setMode('navigate');
        break;
      }

      case 'open-session-dir': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        try {
          openInFileManager(sessionDir(cwd, selectedSessionId));
        } catch {
          notify('Failed to open session directory');
        }
        setMode('navigate');
        break;
      }

      case 'search':
        setMode('search');
        break;

      case 'jump-to-session': {
        // Find the Nth session-type node (1-indexed)
        let count = 0;
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i]?.type === 'session') {
            count++;
            if (count === action.index) {
              setCursorIndex(i);
              break;
            }
          }
        }
        setMode('navigate');
        break;
      }

      case 'spawn-agent': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        setMode('spawn-agent');
        break;
      }

      case 'message-agent': {
        const agent = getAgentForNode(cursorNode);
        if (!agent) { notify('Cursor must be on an agent'); setMode('navigate'); break; }
        setTargetAgentId(agent.id);
        setMode('message-agent');
        break;
      }

      case 'help':
        setMode('help');
        break;

      case 'shell-command': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        setMode('shell-command');
        break;
      }

      case 'jump-to-pane': {
        const agent = getAgentForNode(cursorNode);
        if (!agent?.paneId) { notify('Select an agent with an active pane'); setMode('navigate'); break; }
        if (session?.tmuxSessionName) switchToSession(session.tmuxSessionName);
        if (session?.tmuxWindowId) selectWindow(session.tmuxWindowId);
        selectPane(agent.paneId);
        setMode('navigate');
        break;
      }

      case 'kill': {
        if (!selectedSessionId) { notify('No session selected'); setMode('navigate'); break; }
        const node = nodes[cursorIndex];
        if (node && (node.type === 'agent' || node.type === 'report')) {
          const agentId = node.agentId;
          const agent = agents.find(a => a.id === agentId);
          if (agent?.status !== 'running') { notify(`Agent ${agentId} is not running`); setMode('navigate'); break; }
          sendAndNotify({ type: 'kill-agent', sessionId: selectedSessionId, agentId }, `Killed ${agentId}`);
        } else {
          sendAndNotify({ type: 'kill', sessionId: selectedSessionId }, 'Session killed');
        }
        setMode('navigate');
        break;
      }

      case 'quit':
        exit();
        break;

      case 'dismiss':
        setMode('navigate');
        break;
    }
  });

  // Submit handler — dispatches by input mode
  const handleSubmit = useCallback(
    async (text: string) => {
      switch (mode) {
        case 'resume': {
          if (!selectedSessionId) break;
          await sendAndNotify(
            { type: 'resume', sessionId: selectedSessionId, cwd, message: text || undefined },
            'Session resumed',
          );
          break;
        }
        case 'continue': {
          if (!selectedSessionId) break;
          try {
            const contRes = await send({ type: 'continue', sessionId: selectedSessionId });
            if (!contRes.ok) { notify(`Error: ${contRes.error}`); break; }
            await sendAndNotify(
              { type: 'resume', sessionId: selectedSessionId, cwd, message: text || undefined },
              'Session continued',
            );
          } catch (err) {
            notify(`Error: ${(err as Error).message}`);
          }
          break;
        }
        case 'rollback': {
          if (!selectedSessionId) break;
          const toCycle = parseInt(text, 10);
          if (isNaN(toCycle) || toCycle < 1) { notify('Invalid cycle number'); break; }
          await sendAndNotify(
            { type: 'rollback', sessionId: selectedSessionId, cwd, toCycle },
            `Rolled back to cycle ${toCycle} — use [R]esume to respawn`,
          );
          break;
        }
        case 'delete-confirm': {
          if (!selectedSessionId) break;
          if (text !== 'yes') { notify('Delete cancelled (type "yes" to confirm)'); break; }
          await sendAndNotify(
            { type: 'delete', sessionId: selectedSessionId, cwd },
            'Session deleted',
          );
          break;
        }
        case 'spawn-agent': {
          if (!selectedSessionId) break;
          if (!text.trim()) { notify('Instruction required'); break; }
          await sendAndNotify(
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
          setSearchFilter(text.trim() || null);
          break;
        }
        case 'message-agent': {
          if (!selectedSessionId || !targetAgentId) break;
          await sendAndNotify(
            { type: 'message', sessionId: selectedSessionId, content: text, source: { type: 'agent', agentId: targetAgentId } },
            `Message sent to ${targetAgentId}`,
          );
          setTargetAgentId(null);
          break;
        }
        case 'shell-command': {
          if (!text.trim()) break;
          try {
            openShellPopup(cwd, text);
          } catch {
            notify('Failed to run shell command');
          }
          break;
        }
      }
      setMode('navigate');
    },
    [mode, selectedSessionId, targetAgentId, cwd, notify, sendAndNotify],
  );

  const handleCancel = useCallback(() => {
    setMode('navigate');
    setFocusPane('tree');
    setTargetAgentId(null);
  }, []);

  // Resolve report content for ReportView and AgentDetail
  const reportAgent = useMemo(() => {
    if (mode === 'report-detail') return getAgentForNode(cursorNode);
    return null;
  }, [mode, cursorNode, getAgentForNode]);

  const reportBlocks = useMemo(
    () => (reportAgent ? resolveReports(reportAgent.reports) : []),
    [reportAgent],
  );

  // Resolve reports for agent/report detail panels
  const detailAgent = useMemo(() => {
    if (!cursorNode) return null;
    if (cursorNode.type === 'agent' || cursorNode.type === 'report') {
      return getAgentForNode(cursorNode);
    }
    return null;
  }, [cursorNode, getAgentForNode]);

  const detailReportBlocks = useMemo(
    () => (detailAgent ? resolveReports(detailAgent.reports) : []),
    [detailAgent],
  );

  // Load context file content when cursor is on a context-file node
  const contextFileContent = useMemo(() => {
    if (!cursorNode || cursorNode.type !== 'context-file') return null;
    try {
      if (existsSync(cursorNode.filePath)) {
        return readFileSync(cursorNode.filePath, 'utf-8');
      }
    } catch {
      // file may be unreadable
    }
    return null;
  }, [cursorNode]);

  // Right panel content — determined by cursor node type
  const renderDetailPanel = useCallback(
    (detailWidth: number, contentHeight: number) => {
      // Report detail mode takes full panel
      if (mode === 'report-detail' && reportAgent) {
        return (
          <ReportView
            agent={reportAgent}
            reportBlocks={reportBlocks}
            width={detailWidth}
            height={contentHeight}
            onClose={handleCancel}
          />
        );
      }

      if (!cursorNode || !session) {
        return (
          <SessionDetail
            session={null}
            planContent=""
            goalContent=""
            logsContent=""
            width={detailWidth}
            height={contentHeight}
            paneAlive={true}
          />
        );
      }

      switch (cursorNode.type) {
        case 'session':
          return (
            <SessionDetail
              session={session}
              planContent={planContent}
              goalContent={goalContent}
              logsContent={logsContent}
              width={detailWidth}
              height={contentHeight}
              paneAlive={paneAlive}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );

        case 'cycle': {
          const cycle = session.orchestratorCycles.find(
            (c) => c.cycle === cursorNode.cycleNumber,
          );
          if (!cycle) {
            return (
              <SessionDetail
                session={session}
                planContent={planContent}
                logsContent={logsContent}
                width={detailWidth}
                height={contentHeight}
                paneAlive={paneAlive}
                scrollOffset={detailScrollOffset}
                focused={focusPane === 'detail'}
              />
            );
          }
          return (
            <CycleDetail
              cycle={cycle}
              agents={session.agents}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
        }

        case 'agent': {
          const agent = agents.find((a) => a.id === cursorNode.agentId);
          if (!agent) {
            return (
              <SessionDetail
                session={session}
                planContent={planContent}
                logsContent={logsContent}
                width={detailWidth}
                height={contentHeight}
                paneAlive={paneAlive}
                scrollOffset={detailScrollOffset}
                focused={focusPane === 'detail'}
              />
            );
          }
          return (
            <AgentDetail
              agent={agent}
              reportBlocks={detailReportBlocks}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
        }

        case 'report': {
          const agent = agents.find((a) => a.id === cursorNode.agentId);
          if (!agent) {
            return (
              <SessionDetail
                session={session}
                planContent={planContent}
                logsContent={logsContent}
                width={detailWidth}
                height={contentHeight}
                paneAlive={paneAlive}
                scrollOffset={detailScrollOffset}
                focused={focusPane === 'detail'}
              />
            );
          }
          // Find the specific report for this node and show it inline
          const reportIdx = cursorNode.reportIndex;
          const specificBlock = detailReportBlocks.find((_b, i) => {
            // detailReportBlocks is reversed (newest first), match by index from original reports
            const originalIdx = agent.reports.length - 1 - i;
            return originalIdx === reportIdx;
          });
          if (specificBlock) {
            const badge = specificBlock.type === 'final' ? 'FINAL' : 'UPDATE';
            const badgeColor = specificBlock.type === 'final' ? 'cyan' : 'yellow';
            const reportContentLines: DetailLine[] = [
              [seg(' '), seg(badge, { color: badgeColor }), seg(` ${agent.id} · ${agent.name !== agent.id ? agent.name : agent.agentType}`, { bold: true })],
              singleLine(`  ${formatTime(specificBlock.timestamp)}`, { dim: true }),
              singleLine(' '),
              [seg('  ▎ CONTENT', { color: badgeColor, bold: true })],
              ...wrapText(specificBlock.content.trim(), detailWidth - 8).map(l => singleLine(`    ${l}`)),
            ];
            return (
              <ScrollablePanel
                lines={reportContentLines}
                width={detailWidth}
                height={contentHeight}
                scrollOffset={detailScrollOffset}
                focused={focusPane === 'detail'}
                borderColor={badgeColor}
              />
            );
          }
          return (
            <AgentDetail
              agent={agent}
              reportBlocks={detailReportBlocks}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
        }

        case 'messages': {
          const msgsLines: DetailLine[] = [
            singleLine(` Messages (${session.messages.length})`, { bold: true }),
          ];
          if (session.messages.length === 0) {
            msgsLines.push(singleLine('  No messages', { dim: true, italic: true }));
          } else {
            for (const msg of session.messages) {
              const time = formatTime(msg.timestamp);
              const label = msg.source.type === 'user' ? 'You' : msg.source.type === 'agent' ? msg.source.agentId : 'system';
              const labelColor = msg.source.type === 'user' ? 'yellow' : msg.source.type === 'agent' ? 'cyan' : 'gray';
              const maxContent = Math.max(10, detailWidth - label.length - 20);
              msgsLines.push([
                seg(`  [${time}] `, { dim: true }),
                seg(`${label}: `, { color: labelColor, bold: true }),
                seg(wrapText(msg.summary || msg.content, maxContent)[0] || '', {}),
              ]);
            }
          }
          return (
            <ScrollablePanel
              lines={msgsLines}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
        }

        case 'message': {
          const msg = session.messages.find((m) => m.id === cursorNode.messageId);
          const msgContentLines: DetailLine[] = [
            singleLine(' Message', { bold: true }),
          ];
          if (msg) {
            msgContentLines.push(singleLine(`  ${cursorNode.source} · ${cursorNode.timestamp}`, { dim: true }));
            for (const l of wrapText(msg.content, detailWidth - 8)) {
              msgContentLines.push(singleLine(`  ${l}`));
            }
          } else {
            msgContentLines.push(singleLine('  Message not found', { dim: true }));
          }
          return (
            <ScrollablePanel
              lines={msgContentLines}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
        }

        case 'context': {
          const ctxLines: DetailLine[] = [
            [seg(' '), seg('⊞', { color: 'white' }), seg(` Context (${contextFiles.length})`, { bold: true })],
          ];
          if (contextFiles.length === 0) {
            ctxLines.push(singleLine('  No context files found.', { dim: true }));
          } else {
            for (const f of contextFiles) {
              ctxLines.push(singleLine(`  · ${f}`, { dim: true }));
            }
          }
          return (
            <ScrollablePanel
              lines={ctxLines}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
        }

        case 'context-file': {
          const ctxFileLines: DetailLine[] = [
            [seg(' '), seg('⊞', { color: 'white' }), seg(` ${cursorNode.label}`, { bold: true })],
            singleLine(' '),
          ];
          if (contextFileContent == null) {
            ctxFileLines.push(singleLine('  File not found or unreadable.', { dim: true }));
          } else {
            const wrapped = wrapText(cleanMarkdown(stripFrontmatter(contextFileContent)), detailWidth - 8);
            if (wrapped.length === 0) {
              ctxFileLines.push(singleLine('  (empty)', { dim: true }));
            } else {
              for (const l of wrapped) {
                ctxFileLines.push(singleLine(`    ${l}`));
              }
            }
          }
          return (
            <ScrollablePanel
              lines={ctxFileLines}
              width={detailWidth}
              height={contentHeight}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
              borderColor="white"
            />
          );
        }

        default:
          return (
            <SessionDetail
              session={session}
              planContent={planContent}
              goalContent={goalContent}
              width={detailWidth}
              height={contentHeight}
              paneAlive={paneAlive}
              scrollOffset={detailScrollOffset}
              focused={focusPane === 'detail'}
            />
          );
      }
    },
    [cursorNode, session, planContent, goalContent, logsContent, paneAlive, agents, mode, reportAgent, reportBlocks, detailReportBlocks, handleCancel, detailScrollOffset, focusPane, contextFiles, contextFileContent],
  );

  if (cols < 60 || rows < 12) {
    return (
      <Box flexDirection="column" width={cols} height={rows} justifyContent="center" alignItems="center">
        <Text color="yellow" bold>Terminal too small</Text>
        <Text dimColor>Minimum: 60×12 (current: {cols}×{rows})</Text>
        <Text dimColor>Resize your terminal and try again.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="row" height={contentHeight}>
        <SessionTree
          nodes={nodes}
          cursorIndex={cursorIndex}
          width={treeWidth}
          height={contentHeight}
          focused={mode === 'navigate' && focusPane === 'tree'}
        />

        {renderDetailPanel(detailWidth, contentHeight)}
        {showLogs && (
          <LogsPanel
            cycleLogs={selectedSession ? logsCycles : []}
            width={logsWidth}
            height={contentHeight}
            scrollOffset={logsScrollOffset}
            focused={mode === 'navigate' && focusPane === 'logs'}
          />
        )}
      </Box>

      {notification && (
        <Box paddingX={1}>
          <Text color="yellow" bold>
            {/error|failed/i.test(notification)
              ? `✕ ${notification}`
              : /success|created|killed|sent|copied|deleted/i.test(notification)
                ? `✓ ${notification}`
                : `ℹ ${notification}`}
          </Text>
        </Box>
      )}

      {error && !notification && (
        <Box paddingX={1}>
          <Text color="red">⚠ {error}</Text>
        </Box>
      )}

      <InputBar
        mode={mode}
        defaultText={mode === 'rollback' && cursorNode?.type === 'cycle' ? String(cursorNode.cycleNumber) : undefined}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />

      <StatusLine
        mode={mode}
        detailFocused={focusPane === 'detail'}
        logsFocused={focusPane === 'logs'}
        showLogs={showLogs}
        cursorNodeType={cursorNode?.type}
      />

      <LeaderOverlay mode={mode} rows={rows} cols={cols} />
      <HelpOverlay mode={mode} rows={rows} cols={cols} />
    </Box>
  );
}
