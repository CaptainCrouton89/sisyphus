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
  | 'agent-nicknamed';

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
  spawnedAt: string;
  completedAt: string | null;
}

export interface SessionSummaryCycle {
  cycle: number;
  mode: string | null;
  agentsSpawned: number;
  activeMs: number;
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
  completedAt: string;
  activeMs: number;
  wallClockMs: number | null;
  agentCount: number;
  cycleCount: number;
  completionReport: string | null;
  agents: SessionSummaryAgent[];
  cycles: SessionSummaryCycle[];
  messages: SessionSummaryMessage[];
  finalMoodSignals: MoodSignals | null;
  achievements: string[];
  xpGained: number;
  sentiment: string | null;
}
