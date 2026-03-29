import { join } from 'node:path';
import { messageSourceLabel } from './format.js';
import type {
  TreeNode,
  SessionTreeNode,
  CycleTreeNode,
  AgentTreeNode,
  ReportTreeNode,
  MessagesTreeNode,
  MessageTreeNode,
  ContextTreeNode,
  ContextFileTreeNode,
} from '../types/tree.js';
import type { Session } from '../../shared/types.js';
import type { SessionSummary } from '../state.js';
import { contextDir } from '../../shared/paths.js';

/** Sort priority: active+open=0, active+closed=1, paused+open=2, paused+closed=3, completed=4 */
function sessionSortKey(s: SessionSummary): number {
  if (s.status === 'completed') return 4;
  // Use cached windowAlive from polling hook (avoids execSync in render path)
  const open = s.windowAlive ?? false;
  if (s.status === 'active') return open ? 0 : 1;
  // paused
  return open ? 2 : 3;
}

export function buildTree(
  sessions: SessionSummary[],
  selectedSession: Session | null,
  expanded: Set<string>,
  cwd: string,
  polledContextFiles: string[] = [],
): TreeNode[] {
  const nodes: TreeNode[] = [];

  const sorted = [...sessions].sort((a, b) => {
    const keyDiff = sessionSortKey(a) - sessionSortKey(b);
    if (keyDiff !== 0) return keyDiff;
    // Most recent first within each group
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const s of sorted) {
    const sessionNodeId = `session:${s.id}`;
    const isSelected = selectedSession?.id === s.id;
    const isExpanded = expanded.has(sessionNodeId);

    nodes.push({
      id: sessionNodeId,
      type: 'session',
      depth: 0,
      expandable: true,
      expanded: isExpanded && isSelected,
      sessionId: s.id,
      name: s.name,
      task: s.task,
      status: s.status,
      cycleCount: isSelected ? (selectedSession?.orchestratorCycles.length ?? 0) : 0,
      agentCount: s.agentCount,
      createdAt: s.createdAt,
      completedAt: isSelected ? selectedSession?.completedAt : undefined,
    } satisfies SessionTreeNode);

    // Only emit children for the selected+expanded session
    if (!isExpanded || !isSelected || !selectedSession) continue;

    const cycles = [...selectedSession.orchestratorCycles].reverse();
    const allSpawnedIds = new Set(
      selectedSession.orchestratorCycles.flatMap((c) => c.agentsSpawned),
    );

    for (const cycle of cycles) {
      const cycleNodeId = `cycle:${s.id}:${cycle.cycle}`;
      const cycleExpanded = expanded.has(cycleNodeId);

      // Agents belonging to this cycle
      const cycleAgents = selectedSession.agents.filter((a) =>
        cycle.agentsSpawned.includes(a.id),
      );

      // For the latest cycle, include unassigned agents
      const isLatest = cycle === cycles[0];
      const unassigned = isLatest
        ? selectedSession.agents.filter((a) => !allSpawnedIds.has(a.id))
        : [];
      const allCycleAgents = [...cycleAgents, ...unassigned];

      nodes.push({
        id: cycleNodeId,
        type: 'cycle',
        depth: 1,
        expandable: allCycleAgents.length > 0,
        expanded: cycleExpanded,
        sessionId: s.id,
        cycleNumber: cycle.cycle,
        timestamp: cycle.timestamp,
        completedAt: cycle.completedAt,
        activeMs: cycle.activeMs,
        agentCount: allCycleAgents.length,
        mode: cycle.mode,
      } satisfies CycleTreeNode);

      if (!cycleExpanded) continue;

      for (const agent of allCycleAgents) {
        const agentNodeId = `agent:${s.id}:${agent.id}`;
        const hasReports = agent.reports.length > 0;
        const agentExpanded = expanded.has(agentNodeId);

        nodes.push({
          id: agentNodeId,
          type: 'agent',
          depth: 2,
          expandable: hasReports,
          expanded: agentExpanded && hasReports,
          sessionId: s.id,
          agentId: agent.id,
          name: agent.name,
          agentType: agent.agentType,
          status: agent.status,
          spawnedAt: agent.spawnedAt,
          completedAt: agent.completedAt,
          activeMs: agent.activeMs,
          reportCount: agent.reports.length,
        } satisfies AgentTreeNode);

        if (!agentExpanded || !hasReports) continue;

        for (let ri = 0; ri < agent.reports.length; ri++) {
          const report = agent.reports[ri]!;
          nodes.push({
            id: `report:${s.id}:${agent.id}:${ri}`,
            type: 'report',
            depth: 3,
            expandable: false,
            expanded: false,
            sessionId: s.id,
            reportIndex: ri,
            reportType: report.type,
            timestamp: report.timestamp,
            agentId: agent.id,
          } satisfies ReportTreeNode);
        }
      }
    }

    // Messages group
    const messages = selectedSession.messages ?? [];
    if (messages.length > 0) {
      const msgsNodeId = `messages:${s.id}`;
      const msgsExpanded = expanded.has(msgsNodeId);

      nodes.push({
        id: msgsNodeId,
        type: 'messages',
        depth: 1,
        expandable: true,
        expanded: msgsExpanded,
        sessionId: s.id,
        count: messages.length,
      } satisfies MessagesTreeNode);

      if (msgsExpanded) {
        for (const msg of messages) {
          const agentId = msg.source.type === 'agent' ? msg.source.agentId : undefined;
          const sourceLabel = messageSourceLabel(msg.source.type, agentId);

          nodes.push({
            id: `message:${s.id}:${msg.id}`,
            type: 'message',
            depth: 2,
            expandable: false,
            expanded: false,
            sessionId: s.id,
            messageId: msg.id,
            source: sourceLabel,
            summary: msg.summary || msg.content,
            timestamp: msg.timestamp,
          } satisfies MessageTreeNode);
        }
      }
    }

    // Context group — use polled file list for the selected session (avoids sync I/O in render)
    const contextFiles = isSelected ? polledContextFiles : [];

    const ctxNodeId = `context:${s.id}`;
    const ctxExpanded = expanded.has(ctxNodeId);

    nodes.push({
      id: ctxNodeId,
      type: 'context',
      depth: 1,
      expandable: contextFiles.length > 0,
      expanded: ctxExpanded && contextFiles.length > 0,
      sessionId: s.id,
      fileCount: contextFiles.length,
    } satisfies ContextTreeNode);

    if (ctxExpanded && contextFiles.length > 0) {
      for (const filename of contextFiles) {
        nodes.push({
          id: `context-file:${s.id}:${filename}`,
          type: 'context-file',
          depth: 2,
          expandable: false,
          expanded: false,
          sessionId: s.id,
          label: filename,
          filePath: join(contextDir(cwd, s.id), filename),
        } satisfies ContextFileTreeNode);
      }
    }
  }

  return nodes;
}

/** Find the parent node index for a given node index */
export function findParentIndex(nodes: TreeNode[], index: number): number {
  const node = nodes[index];
  if (!node || node.depth === 0) return index;
  const targetDepth = node.depth - 1;
  for (let i = index - 1; i >= 0; i--) {
    if (nodes[i]!.depth === targetDepth) return i;
    if (nodes[i]!.depth < targetDepth) return i;
  }
  return 0;
}
