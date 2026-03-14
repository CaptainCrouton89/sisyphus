import { useState, useEffect, useRef, useCallback } from 'react';
import { send } from '../lib/client.js';
import { readFileSync, existsSync } from 'node:fs';
import { planPath } from '../../shared/paths.js';
import { windowExists } from '../lib/tmux.js';
import type { Session } from '../../shared/types.js';

export interface SessionSummary {
  id: string;
  task: string;
  status: string;
  agentCount: number;
  createdAt: string;
}

export interface PollingState {
  sessions: SessionSummary[];
  selectedSession: Session | null;
  planContent: string;
  paneAlive: boolean;
  error: string | null;
}

export function usePolling(
  cwd: string,
  selectedSessionId: string | null,
  intervalMs: number = 2500,
): PollingState {
  const [state, setState] = useState<PollingState>({
    sessions: [],
    selectedSession: null,
    planContent: '',
    paneAlive: true,
    error: null,
  });

  const selectedIdRef = useRef(selectedSessionId);
  selectedIdRef.current = selectedSessionId;
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const listRes = await send({ type: 'list', cwd });
      if (!mountedRef.current) return;

      const sessions = listRes.ok
        ? ((listRes.data?.sessions as SessionSummary[] | undefined) ?? [])
        : [];

      let selectedSession: Session | null = null;
      let planContent = '';
      let paneAlive = true;

      if (selectedIdRef.current) {
        const statusRes = await send({ type: 'status', sessionId: selectedIdRef.current, cwd });
        if (mountedRef.current && statusRes.ok) {
          selectedSession = (statusRes.data?.session as Session | undefined) ?? null;
        }

        // Check if the session's tmux window is still alive
        if (selectedSession?.tmuxWindowId) {
          try {
            paneAlive = windowExists(selectedSession.tmuxWindowId);
          } catch {
            paneAlive = false;
          }
        }

        try {
          const pp = planPath(cwd, selectedIdRef.current);
          if (existsSync(pp)) {
            planContent = readFileSync(pp, 'utf-8');
          }
        } catch {
          // plan.md may not exist yet
        }
      }

      if (mountedRef.current) {
        setState({ sessions, selectedSession, planContent, paneAlive, error: null });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, error: (err as Error).message }));
      }
    }
  }, [cwd]);

  // Regular polling interval
  useEffect(() => {
    mountedRef.current = true;
    poll();
    const interval = setInterval(poll, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [cwd, intervalMs, poll]);

  // Immediate fetch when selected session changes
  useEffect(() => {
    if (selectedSessionId != null) {
      poll();
    }
  }, [selectedSessionId, poll]);

  return state;
}
