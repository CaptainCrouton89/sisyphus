import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import { SessionList } from './components/SessionList.js';
import { SessionDetail } from './components/SessionDetail.js';
import { ReportView } from './components/ReportView.js';
import { InputBar, type InputMode } from './components/InputBar.js';
import { StatusLine } from './components/StatusLine.js';
import { usePolling } from './hooks/usePolling.js';
import { useKeybindings } from './hooks/useKeybindings.js';
import { send } from './lib/client.js';
import {
  openCompanionPopup,
  openEditorPopup,
  getWindowId,
  selectWindow,
  selectPane,
} from './lib/tmux.js';
import { planPath } from '../shared/paths.js';
import { loadConfig } from '../shared/config.js';

interface Props {
  cwd: string;
  tmuxSession: string;
}

export function App({ cwd, tmuxSession }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 24;
  const cols = stdout.columns ?? 80;
  const config = loadConfig(cwd);

  // State
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(0);
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);
  const [focus, setFocus] = useState<'sessions' | 'agents'>('sessions');
  const [mode, setMode] = useState<InputMode>('navigate');
  const [notification, setNotification] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Single polling call
  const { sessions, selectedSession, planContent, paneAlive, error } = usePolling(cwd, selectedSessionId);

  // Sync selectedSessionId
  useEffect(() => {
    const id = sessions[selectedSessionIdx]?.id ?? null;
    if (id !== selectedSessionId) {
      setSelectedSessionId(id);
    }
  }, [sessions, selectedSessionIdx, selectedSessionId]);

  // Auto-clamp session index
  useEffect(() => {
    if (sessions.length > 0 && selectedSessionIdx >= sessions.length) {
      setSelectedSessionIdx(sessions.length - 1);
    }
  }, [sessions, selectedSessionIdx]);

  // Reset agent selection on session change
  useEffect(() => {
    setSelectedAgentIdx(0);
  }, [selectedSessionIdx]);

  // Clear notification
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(t);
  }, [notification]);

  const notify = useCallback((msg: string) => setNotification(msg), []);

  const session = selectedSession;
  const agents = session?.agents ?? [];

  // Keybindings (only active in navigate mode)
  useKeybindings(
    {
      onMoveUp: () => {
        if (focus === 'sessions') {
          setSelectedSessionIdx((i) => Math.max(0, i - 1));
        } else {
          setSelectedAgentIdx((i) => Math.max(0, i - 1));
        }
      },
      onMoveDown: () => {
        if (focus === 'sessions') {
          setSelectedSessionIdx((i) => Math.min(sessions.length - 1, i + 1));
        } else {
          setSelectedAgentIdx((i) => Math.min(agents.length - 1, i + 1));
        }
      },
      onTab: () => {
        setFocus((f) => (f === 'sessions' ? 'agents' : 'sessions'));
      },
      onEnter: () => {
        if (focus === 'agents' && agents[selectedAgentIdx]) {
          setMode('report-detail');
        }
      },
      onMessage: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        setMode('message');
      },
      onKill: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        send({ type: 'kill', sessionId: selectedSessionId }).then((res) => {
          notify(res.ok ? 'Session killed' : `Error: ${!res.ok ? res.error : 'unknown'}`);
        }).catch((err: Error) => notify(`Error: ${err.message}`));
      },
      onGoToWindow: () => {
        if (!session?.tmuxWindowId) { notify('No tmux window'); return; }
        selectWindow(session.tmuxWindowId);
      },
      onNewSession: () => setMode('new-session'),
      onClaude: () => {
        try {
          openCompanionPopup(cwd);
        } catch {
          notify('Failed to open companion popup');
        }
      },
      onOpenPlan: () => {
        if (!selectedSessionId) { notify('No session selected'); return; }
        const pp = planPath(cwd, selectedSessionId);
        const editor = config.editor ?? process.env.EDITOR ?? 'nvim';
        try {
          openEditorPopup(cwd, editor, pp);
        } catch {
          notify(`Failed to open plan in ${editor}`);
        }
      },
      onQuit: () => {
        exit();
      },
      onReRun: () => {
        if (focus !== 'agents' || !selectedSessionId) {
          notify('Tab to agents first'); return;
        }
        const agent = agents[selectedAgentIdx];
        if (!agent) { notify('No agent selected'); return; }
        send({
          type: 'spawn',
          sessionId: selectedSessionId,
          agentType: agent.agentType,
          name: `${agent.name}-retry`,
          instruction: agent.instruction,
        }).then((res) => {
          notify(res.ok ? `Re-spawned ${agent.name}` : `Error: ${!res.ok ? res.error : 'unknown'}`);
        }).catch((err: Error) => notify(`Error: ${err.message}`));
      },
      onJumpToPane: () => {
        if (focus !== 'agents') { notify('Tab to agents first'); return; }
        const agent = agents[selectedAgentIdx];
        if (!agent?.paneId) { notify('Agent has no active pane'); return; }
        if (session?.tmuxWindowId) selectWindow(session.tmuxWindowId);
        selectPane(agent.paneId);
      },
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
    },
    mode === 'navigate',
  );

  // Input handlers
  const handleSubmitMessage = useCallback(
    async (text: string) => {
      if (!selectedSessionId) return;
      try {
        const res = await send({ type: 'message', sessionId: selectedSessionId, content: text });
        notify(res.ok ? 'Message queued' : `Error: ${!res.ok ? res.error : 'unknown'}`);
      } catch (err) {
        notify(`Error: ${(err as Error).message}`);
      }
      setMode('navigate');
    },
    [selectedSessionId, notify],
  );

  const handleSubmitNewSession = useCallback(
    async (task: string) => {
      try {
        const tmuxWindow = getWindowId();
        const res = await send({ type: 'start', task, cwd, tmuxSession, tmuxWindow });
        notify(
          res.ok
            ? `Session created: ${(res.data?.sessionId as string | undefined) ?? 'ok'}`
            : `Error: ${!res.ok ? res.error : 'unknown'}`,
        );
      } catch (err) {
        notify(`Error: ${(err as Error).message}`);
      }
      setMode('navigate');
    },
    [cwd, tmuxSession, notify],
  );

  const handleSubmitResume = useCallback(
    async (message: string) => {
      if (!selectedSessionId) return;
      try {
        const tmuxWindow = getWindowId();
        const res = await send({
          type: 'resume',
          sessionId: selectedSessionId,
          cwd,
          tmuxSession,
          tmuxWindow,
          message: message || undefined,
        });
        notify(res.ok ? 'Session resumed' : `Error: ${!res.ok ? res.error : 'unknown'}`);
      } catch (err) {
        notify(`Error: ${(err as Error).message}`);
      }
      setMode('navigate');
    },
    [selectedSessionId, cwd, tmuxSession, notify],
  );

  const handleSubmitContinue = useCallback(
    async (message: string) => {
      if (!selectedSessionId) return;
      try {
        // First reset the session state (clear plan, mark active)
        const contRes = await send({ type: 'continue', sessionId: selectedSessionId });
        if (!contRes.ok) {
          notify(`Error: ${!contRes.ok ? contRes.error : 'unknown'}`);
          setMode('navigate');
          return;
        }
        // Then resume with a fresh orchestrator
        const tmuxWindow = getWindowId();
        const res = await send({
          type: 'resume',
          sessionId: selectedSessionId,
          cwd,
          tmuxSession,
          tmuxWindow,
          message: message || undefined,
        });
        notify(res.ok ? 'Session continued' : `Error: ${!res.ok ? res.error : 'unknown'}`);
      } catch (err) {
        notify(`Error: ${(err as Error).message}`);
      }
      setMode('navigate');
    },
    [selectedSessionId, cwd, tmuxSession, notify],
  );

  const handleCancel = useCallback(() => setMode('navigate'), []);
  const handleCloseReport = useCallback(() => setMode('navigate'), []);

  // Layout
  const listWidth = Math.max(20, Math.floor(cols * 0.25));
  const detailWidth = cols - listWidth;
  const contentHeight = rows - 3;

  // Report detail mode: replace right panel with report view
  const reportAgent = mode === 'report-detail' ? agents[selectedAgentIdx] : null;

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="row" height={contentHeight}>
        <SessionList
          sessions={sessions}
          selectedIndex={selectedSessionIdx}
          focused={focus === 'sessions' && mode === 'navigate'}
          width={listWidth}
        />

        {reportAgent ? (
          <ReportView
            agent={reportAgent}
            width={detailWidth}
            height={contentHeight}
            onClose={handleCloseReport}
          />
        ) : (
          <SessionDetail
            session={session}
            planContent={planContent}
            selectedAgentIndex={selectedAgentIdx}
            agentFocused={focus === 'agents' && mode === 'navigate'}
            width={detailWidth}
            height={contentHeight}
            paneAlive={paneAlive}
          />
        )}
      </Box>

      {notification && (
        <Box paddingX={1}>
          <Text color="yellow" bold>{notification}</Text>
        </Box>
      )}

      {error && !notification && (
        <Box paddingX={1}>
          <Text color="red">⚠ {error}</Text>
        </Box>
      )}

      <InputBar
        mode={mode}
        onSubmitMessage={handleSubmitMessage}
        onSubmitNewSession={handleSubmitNewSession}
        onSubmitResume={handleSubmitResume}
        onSubmitContinue={handleSubmitContinue}
        onCancel={handleCancel}
      />

      <StatusLine mode={mode} focus={focus} />
    </Box>
  );
}
