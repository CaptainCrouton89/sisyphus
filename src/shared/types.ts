export type Provider = 'anthropic' | 'openai';

export interface StatusBarColors {
  processing?: string;
  stopped?: string;
  idle?: string;
  activeBg?: string;
  activeText?: string;
  inactiveText?: string;
}

export interface SegmentConfig {
  bg?: string;
  activeBg?: string;
  [key: string]: unknown;
}

export interface StatusBarConfig {
  enabled?: boolean;
  colors?: StatusBarColors;
  left?: string[];
  right?: string[];
  segments?: Record<string, SegmentConfig>;
}

export type SessionStatus = 'active' | 'paused' | 'completed';

export type MessageSource =
  | { type: 'agent'; agentId: string }
  | { type: 'user' }
  | { type: 'system'; detail?: string };

export interface Message {
  id: string;
  source: MessageSource;
  content: string;
  summary: string;
  filePath?: string;
  timestamp: string;
}

export type AgentStatus = 'running' | 'completed' | 'killed' | 'crashed' | 'lost';

export interface AgentReport {
  type: 'update' | 'final';
  filePath: string;
  summary: string;
  timestamp: string;
}

export interface Session {
  id: string;
  name?: string;
  task: string;
  context?: string;
  cwd: string;
  status: SessionStatus;
  createdAt: string;
  completedAt?: string;
  activeMs: number;
  agents: Agent[];
  orchestratorCycles: OrchestratorCycle[];
  messages: Message[];
  completionReport?: string;
  parentSessionId?: string;
  tmuxSessionName?: string;
  tmuxSessionId?: string;       // tmux $N session ID — stable across renames, exact-match targeting
  tmuxWindowId?: string;
  model?: string;
  wallClockMs?: number;
  startHour?: number;
  startDayOfWeek?: number;
  launchConfig?: { model?: string; context?: string; orchestratorPrompt?: string; };
  /** Cycles already credited to companion stats (prevents double-counting on continue→re-complete) */
  companionCreditedCycles?: number;
  /** activeMs already credited to companion stats */
  companionCreditedActiveMs?: number;
  /** Strength already credited to companion stats */
  companionCreditedStrength?: number;
  rollbackCount?: number;
  resumeCount?: number;
  continueCount?: number;
  companionCreditedWisdom?: number;
}

export interface StatusDigest {
  recentWork: string;
  unusualEvents: string[];
  currentActivity: string;
  whatsNext: string;
}

export interface Agent {
  id: string;
  name: string;
  nickname?: string;
  agentType: string;
  provider?: Provider;
  claudeSessionId?: string;
  color: string;
  instruction: string;
  status: AgentStatus;
  spawnedAt: string;
  completedAt: string | null;
  activeMs: number;
  reports: AgentReport[];
  paneId: string;
  repo: string;
  killedReason?: string;
  restartCount?: number;
  originalSpawnedAt?: string;
  resumeEnv?: string;
  resumeArgs?: string;
}

export interface OrchestratorCycle {
  cycle: number;
  timestamp: string;
  completedAt?: string;
  activeMs: number;
  interCycleGapMs?: number;
  agentsSpawned: string[];
  paneId?: string;
  claudeSessionId?: string;
  nextPrompt?: string;
  mode?: string;
  resumeEnv?: string;
  resumeArgs?: string;
}
