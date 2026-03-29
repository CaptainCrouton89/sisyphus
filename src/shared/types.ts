export type Provider = 'anthropic' | 'openai';

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
  tmuxWindowId?: string;
}

export interface Agent {
  id: string;
  name: string;
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
}

export interface OrchestratorCycle {
  cycle: number;
  timestamp: string;
  completedAt?: string;
  activeMs: number;
  agentsSpawned: string[];
  paneId?: string;
  claudeSessionId?: string;
  nextPrompt?: string;
  mode?: string;
}
