import { useState, useEffect, useRef, useCallback } from 'react';
import { send } from '../lib/client.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { goalPath, logsDir, legacyLogsPath, roadmapPath } from '../../shared/paths.js';
import { windowExists } from '../lib/tmux.js';
import type { Session } from '../../shared/types.js';

export interface SessionSummary {
  id: string;
  task: string;
  status: string;
  agentCount: number;
  createdAt: string;
  tmuxWindowId?: string;
}

export interface PollingState {
  sessions: SessionSummary[];
  selectedSession: Session | null;
  planContent: string;
  goalContent: string;
  logsContent: string;
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
    goalContent: '',
    logsContent: '',
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
      let goalContent = '';
      let logsContent = '';
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
          const pp = roadmapPath(cwd, selectedIdRef.current);
          if (existsSync(pp)) {
            planContent = readFileSync(pp, 'utf-8');
          }
        } catch {
          // roadmap.md may not exist yet
        }

        try {
          const gp = goalPath(cwd, selectedIdRef.current);
          if (existsSync(gp)) {
            goalContent = readFileSync(gp, 'utf-8');
          }
        } catch {
          // goal.md may not exist yet
        }

        try {
          const ld = logsDir(cwd, selectedIdRef.current);
          if (existsSync(ld)) {
            const files = readdirSync(ld).filter(f => f.startsWith('cycle-')).sort();
            logsContent = files.map(f => readFileSync(join(ld, f), 'utf-8')).join('\n');
          } else {
            // Legacy fallback
            const lp = legacyLogsPath(cwd, selectedIdRef.current);
            if (existsSync(lp)) logsContent = readFileSync(lp, 'utf-8');
          }
        } catch {
          // logs may not exist yet
        }
      }

      if (mountedRef.current) {
        setState({ sessions, selectedSession, planContent, goalContent, logsContent, paneAlive, error: null });
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
