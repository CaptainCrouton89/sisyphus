export type SessionStatus = 'active' | 'paused' | 'completed';

export type TaskStatus = 'draft' | 'pending' | 'in_progress' | 'done';

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
  tasks: Task[];
  agents: Agent[];
  orchestratorCycles: OrchestratorCycle[];
  completionReport?: string;
  parentSessionId?: string;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
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
}

export interface OrchestratorCycle {
  cycle: number;
  timestamp: string;
  completedAt?: string;
  agentsSpawned: string[];
  paneId?: string;
}
