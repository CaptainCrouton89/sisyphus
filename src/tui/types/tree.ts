export type TreeNodeType = 'session' | 'cycle' | 'agent' | 'report' | 'messages' | 'message';

interface BaseTreeNode {
  id: string;
  type: TreeNodeType;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  sessionId: string;
}

export interface SessionTreeNode extends BaseTreeNode {
  type: 'session';
  depth: 0;
  task: string;
  status: string;
  cycleCount: number;
  agentCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface CycleTreeNode extends BaseTreeNode {
  type: 'cycle';
  depth: 1;
  cycleNumber: number;
  timestamp: string;
  completedAt?: string;
  agentCount: number;
  mode?: string;
}

export interface AgentTreeNode extends BaseTreeNode {
  type: 'agent';
  depth: 2;
  agentId: string;
  name: string;
  agentType: string;
  status: string;
  spawnedAt: string;
  completedAt: string | null;
  reportCount: number;
}

export interface ReportTreeNode extends BaseTreeNode {
  type: 'report';
  depth: 3;
  reportIndex: number;
  reportType: 'update' | 'final';
  timestamp: string;
  agentId: string;
}

export interface MessagesTreeNode extends BaseTreeNode {
  type: 'messages';
  depth: 1;
  count: number;
}

export interface MessageTreeNode extends BaseTreeNode {
  type: 'message';
  depth: 2;
  messageId: string;
  source: string;
  summary: string;
  timestamp: string;
}

export type TreeNode =
  | SessionTreeNode
  | CycleTreeNode
  | AgentTreeNode
  | ReportTreeNode
  | MessagesTreeNode
  | MessageTreeNode;
