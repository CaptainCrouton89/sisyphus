export type SessionStatus = 'active' | 'paused' | 'completed';

export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'blocked';

export type AgentStatus = 'running' | 'completed' | 'killed' | 'crashed' | 'lost';

export interface Session {
  id: string;
  task: string;
  cwd: string;
  status: SessionStatus;
  createdAt: string;
  tasks: Task[];
  agents: Agent[];
  orchestratorCycles: OrchestratorCycle[];
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
  report: string | null;
  paneId: string;
  killedReason?: string;
}

export interface OrchestratorCycle {
  cycle: number;
  timestamp: string;
  agentsSpawned: string[];
  paneId?: string;
}
