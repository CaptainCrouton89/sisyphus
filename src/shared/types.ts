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
  /** Set true when the orchestrator pane vanished unexpectedly or daemon-startup found a stuck session. */
  orphaned?: boolean;
  /** Reason string passed to markSessionOrphan — mirrors agent.killedReason. */
  orphanReason?: string;
  /** Cumulative time blocked on `sisyphus ask` (blocking asks only). Subtracted from wallClockMs to compute efficiency. */
  userBlockedMs?: number;
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
  effort?: 'low' | 'medium' | 'high' | 'xhigh';
}

export interface StatusDigest {
  recentWork: string;
  unusualEvents: string[];
  currentActivity: string;
  whatsNext: string;
  effort?: string;
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
  /** Set true when the agent's pane vanished unexpectedly or pid+lstart no longer match. Orthogonal to status. */
  orphaned?: boolean;
  /** Captured at spawn time by `setupAgentPane` → first `tmux display-message #{pane_pid}`. */
  pid?: number;
  /** `ps -o lstart=` output captured at spawn. Compared during pid-sweep to detect PID recycling. */
  pidLstart?: string;
}

export interface OrchestratorCycle {
  cycle: number;
  timestamp: string;
  completedAt?: string;
  activeMs: number;
  /** Cumulative time blocked on `sisyphus ask` during this cycle (blocking asks only). */
  userBlockedMs?: number;
  interCycleGapMs?: number;
  agentsSpawned: string[];
  paneId?: string;
  claudeSessionId?: string;
  nextPrompt?: string;
  mode?: string;
  resumeEnv?: string;
  resumeArgs?: string;
}

// ── sisyphus ask: v2 interaction / deck types (mirror humanloop's published shapes) ──

export type InteractionKind = 'notify' | 'validation' | 'decision' | 'context' | 'error';

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
}

export interface Interaction {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  bodyPath?: string;
  options: InteractionOption[];
  allowFreetext?: boolean;
  freetextLabel?: string;
  kind?: InteractionKind;
}

export interface DeckSource {
  sessionName?: string;
  askedBy?: string;
  blockedSince?: string;
}

export interface Deck {
  title?: string;
  source?: DeckSource;
  interactions: Interaction[];
}

export interface InteractionResponse {
  id: string;
  selectedOptionId?: string;
  freetext?: string;
}

export interface AskOutput {
  responses: InteractionResponse[];
  completedAt: string;
}

export interface VisualBlock {
  questionId: string;
  content: string;
  status: 'loading' | 'ready' | 'error';
}

export const ORCHESTRATOR_ASKED_BY = 'orchestrator' as const;

export type AskStatus = 'pending' | 'in-progress' | 'answered' | 'not-found';

export interface AskMeta {
  askId: string;
  askedBy: string;
  askedAt: string;
  status: AskStatus;
  blocking: boolean;
  pid?: number;
  startedAt?: string;
  completedAt?: string;
  orphaned?: boolean;
  /** ISO timestamp set by the heartbeat scanner when a stale-question notify ask is emitted; dedup key. */
  heartbeatNotifiedAt?: string;
  claudeSessionId?: string;
  cwd: string;
  title?: string;
  subtitle?: string;
  kind?: InteractionKind;
  /** Set on system-emitted error-kind asks; carries the takeover-dispatch context. */
  orphanTarget?: { kind: 'agent'; agentId: string; paneId?: string } | { kind: 'orchestrator' };
}
