import type { MoodSignals } from './companion-types.js';

export type HistoryEventType =
  | 'session-start'
  | 'agent-spawned'
  | 'agent-completed'
  | 'agent-exited'
  | 'cycle-boundary'
  | 'signals-snapshot'
  | 'session-end'
  | 'message'
  | 'session-named'
  | 'agent-nicknamed'
  | 'review-started'
  | 'review-completed'
  | 'agent-killed'
  | 'agent-restarted'
  | 'rollback'
  | 'session-resumed'
  | 'session-continued'
  | 'session-cloned'
  | 'cloned-from'
  | 'popup-feedback'
  | 'ask-issued'
  | 'ask-answered'
  | 'bg-tasks-leftover';

export interface HistoryEvent {
  ts: string;
  event: HistoryEventType;
  sessionId: string;
  data: Record<string, unknown>;
}

export interface SessionSummaryMessage {
  id: string;
  source: string;
  content: string;
  timestamp: string;
}

export interface SessionSummaryAgent {
  id: string;
  name: string;
  nickname: string | null;
  agentType: string | null;
  status: string;
  activeMs: number;
  /** Time this agent was blocked on its own blocking `sisyphus ask` calls. Subset of activeMs. */
  userBlockedMs?: number;
  spawnedAt: string;
  completedAt: string | null;
  restartCount?: number;
}

export interface SessionSummaryCycle {
  cycle: number;
  mode: string | null;
  agentsSpawned: number;
  activeMs: number;
  /** Time the orchestrator was blocked on blocking `sisyphus ask` calls during this cycle. */
  userBlockedMs?: number;
  startedAt: string;
  completedAt: string | null;
}


export interface SessionSummary {
  sessionId: string;
  name: string | null;
  task: string;
  context: string | null;
  cwd: string;
  model: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  activeMs: number;
  wallClockMs: number | null;
  userBlockedMs: number;
  agentCount: number;
  cycleCount: number;
  completionReport: string | null;
  agents: SessionSummaryAgent[];
  cycles: SessionSummaryCycle[];
  messages: SessionSummaryMessage[];
  finalMoodSignals: MoodSignals | null;
  achievements: string[];
  crashCount: number;
  lostCount: number;
  killedAgentCount: number;
  rollbackCount: number;
  efficiency: number | null;
  xpGained: number;
  sentiment: string | null;
}
