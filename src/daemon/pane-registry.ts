type PaneEntry = {
  sessionId: string;
  role: 'orchestrator' | 'agent';
  agentId?: string;
};

const paneMap = new Map<string, PaneEntry>();

export function registerPane(paneId: string, sessionId: string, role: 'orchestrator' | 'agent', agentId?: string): void {
  paneMap.set(paneId, { sessionId, role, agentId });
}

export function unregisterPane(paneId: string): void {
  paneMap.delete(paneId);
}

export function unregisterAgentPane(sessionId: string, agentId: string): void {
  for (const [paneId, entry] of paneMap) {
    if (entry.sessionId === sessionId && entry.agentId === agentId) {
      paneMap.delete(paneId);
      return;
    }
  }
}

export function unregisterSessionPanes(sessionId: string): void {
  for (const [paneId, entry] of paneMap) {
    if (entry.sessionId === sessionId) {
      paneMap.delete(paneId);
    }
  }
}

export function lookupPane(paneId: string): PaneEntry | undefined {
  return paneMap.get(paneId);
}
