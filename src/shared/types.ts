export type SessionStatus = 'active' | 'paused' | 'completed';

export type AgentStatus = 'running' | 'completed' | 'killed' | 'crashed' | 'lost';

export interface AgentReport {
  type: 'update' | 'final';
  filePath: string;
  summary: string;
  timestamp: string;
}

export interface Session {
  id: string;
  task: string;
  cwd: string;
  status: SessionStatus;
  createdAt: string;
  completedAt?: string;
  agents: Agent[];
  orchestratorCycles: OrchestratorCycle[];
  completionReport?: string;
  parentSessionId?: string;
  tmuxSessionName?: string;
  tmuxWindowId?: string;
}

export interface Agent {
  id: string;
  name: string;
  agentType: string;
  claudeSessionId?: string;
  color: string;
  instruction: string;
  status: AgentStatus;
  spawnedAt: string;
  completedAt: string | null;
  reports: AgentReport[];
  paneId: string;
  killedReason?: string;
  worktreePath?: string;
  branchName?: string;
  mergeStatus?: 'pending' | 'merged' | 'no-changes' | 'conflict';
  mergeDetails?: string;
}

export interface OrchestratorCycle {
  cycle: number;
  timestamp: string;
  completedAt?: string;
  agentsSpawned: string[];
  paneId?: string;
  nextPrompt?: string;
}
