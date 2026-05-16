import { join } from 'node:path';
import { messageSourceLabel } from './format.js';
import type {
  TreeNode,
  SectionTreeNode,
  NeedsYouVirtualTreeNode,
  SessionTreeNode,
  CycleTreeNode,
  AgentTreeNode,
  ReportTreeNode,
  MessagesTreeNode,
  MessageTreeNode,
  ContextTreeNode,
  ContextFileTreeNode,
  SectionKey,
} from '../types/tree.js';
import type { Session } from '../../shared/types.js';
import type { SessionSummary } from '../state.js';
import type { InboxItem } from '../../shared/inbox-types.js';
import { sessionIdFromDir } from '../../shared/inbox-types.js';
import { contextDir } from '../../shared/paths.js';

/** Sort priority: active+open=0, active+closed=1, paused+open=2, paused+closed=3, completed=4 */
function sessionSortKey(s: SessionSummary): number {
  if (s.status === 'completed') return 4;
  // Use cached windowAlive from polling hook (avoids execSync in render path)
  const open = s.windowAlive ?? false;
  if (s.status === 'active') return open ? 0 : 1;
  // paused — goes in Running section (not Done)
  return open ? 2 : 3;
}

export function buildTree(
  sessions: SessionSummary[],
  selectedSession: Session | null,
  expanded: Set<string>,
  cwd: string,
  polledContextFiles: string[] = [],
  aggregateInbox: InboxItem[] = [],
): TreeNode[] {
  const nodes: TreeNode[] = [];

  // Build per-session inbox index
  const inboxBySession = new Map<string, InboxItem[]>();
  for (const item of aggregateInbox) {
    const sessionId = sessionIdFromDir(item.dir);
    const arr = inboxBySession.get(sessionId) ?? [];
    arr.push(item);
    inboxBySession.set(sessionId, arr);
  }

  // Bucket sessions
  const needsYou: SessionSummary[] = [];
  const running: SessionSummary[] = [];
  const done: SessionSummary[] = [];
  for (const s of sessions) {
    if (inboxBySession.has(s.id)) needsYou.push(s);
    else if (s.status === 'completed') done.push(s);
    else running.push(s); // active + paused both land here
  }

  // Sort within each bucket
  needsYou.sort((a, b) => {
    const aItems = inboxBySession.get(a.id)!;
    const bItems = inboxBySession.get(b.id)!;
    const aOldest = Math.min(...aItems.map(i => Date.parse(i.blockedSince)));
    const bOldest = Math.min(...bItems.map(i => Date.parse(i.blockedSince)));
    return aOldest - bOldest;
  });
  running.sort((a, b) => {
    const k = sessionSortKey(a) - sessionSortKey(b);
    if (k !== 0) return k;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  // SessionSummary has no completedAt — sort done by createdAt descending
  done.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  // Emit helpers
  function sectionExpanded(key: SectionKey): boolean {
    return expanded.has(`section:${key}`);
  }

  function emitSection(key: SectionKey, count: number): void {
    const exp = sectionExpanded(key);
    nodes.push({
      id: `section:${key}`,
      type: 'section',
      depth: 0,
      section: key,
      count,
      expandable: true,
      expanded: exp,
      sessionId: '',
      prefix: '',
    } satisfies SectionTreeNode);
  }

  function emitSessionChildren(s: SessionSummary): void {
    if (!selectedSession || selectedSession.id !== s.id) return;

    const cycles = [...selectedSession.orchestratorCycles].reverse();
    const allSpawnedIds = new Set(
      selectedSession.orchestratorCycles.flatMap((c) => c.agentsSpawned),
    );

    for (const cycle of cycles) {
      const cycleNodeId = `cycle:${s.id}:${cycle.cycle}`;
      const cycleExpanded = expanded.has(cycleNodeId);

      const cycleAgents = selectedSession.agents.filter((a) =>
        cycle.agentsSpawned.includes(a.id),
      );
      const isLatest = cycle === cycles[0];
      const unassigned = isLatest
        ? selectedSession.agents.filter((a) => !allSpawnedIds.has(a.id))
        : [];
      const allCycleAgents = [...cycleAgents, ...unassigned];

      nodes.push({
        id: cycleNodeId,
        type: 'cycle',
        depth: 2,
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
          depth: 3,
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
          orphaned: agent.orphaned ?? false,
        } satisfies AgentTreeNode);

        if (!agentExpanded || !hasReports) continue;

        for (let ri = 0; ri < agent.reports.length; ri++) {
          const report = agent.reports[ri]!;
          nodes.push({
            id: `report:${s.id}:${agent.id}:${ri}`,
            type: 'report',
            depth: 4,
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
        depth: 2,
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
            depth: 3,
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

    // Context group
    const isSelected = selectedSession?.id === s.id;
    const contextFiles = isSelected ? polledContextFiles : [];

    const ctxNodeId = `context:${s.id}`;
    const ctxExpanded = expanded.has(ctxNodeId);

    nodes.push({
      id: ctxNodeId,
      type: 'context',
      depth: 2,
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
          depth: 3,
          expandable: false,
          expanded: false,
          sessionId: s.id,
          label: filename,
          filePath: join(contextDir(cwd, s.id), filename),
        } satisfies ContextFileTreeNode);
      }
    }
  }

  function emitSessionRow(s: SessionSummary, askCount: number): void {
    const sessionNodeId = `session:${s.id}`;
    const isSelected = selectedSession?.id === s.id;
    const isExpanded = expanded.has(sessionNodeId);

    nodes.push({
      id: sessionNodeId,
      type: 'session',
      depth: 1,
      expandable: true,
      expanded: isExpanded && isSelected,
      sessionId: s.id,
      name: s.name,
      task: s.task,
      status: s.status,
      cycleCount: isSelected ? (selectedSession?.orchestratorCycles.length ?? 0) : 0,
      agentCount: s.agentCount,
      runningAgentCount: s.runningAgentCount,
      createdAt: s.createdAt,
      completedAt: isSelected ? selectedSession?.completedAt : undefined,
      activeMs: isSelected ? (selectedSession?.activeMs ?? s.activeMs) : s.activeMs,
      askCount: askCount > 0 ? askCount : undefined,
      orphaned: s.orphaned ?? false,
    } satisfies SessionTreeNode);

    if (isExpanded && isSelected) {
      emitSessionChildren(s);
    }
  }

  // Emit Needs You section
  emitSection('needs-you', needsYou.length);
  if (sectionExpanded('needs-you')) {
    nodes.push({
      id: 'needs-you-virtual',
      type: 'needs-you-virtual',
      depth: 1,
      expandable: false,
      expanded: false,
      sessionId: '',
      pendingCount: aggregateInbox.length,
    } satisfies NeedsYouVirtualTreeNode);
    for (const s of needsYou) {
      emitSessionRow(s, inboxBySession.get(s.id)?.length ?? 0);
    }
  }

  // Emit Running section
  emitSection('running', running.length);
  if (sectionExpanded('running')) {
    for (const s of running) {
      emitSessionRow(s, 0);
    }
  }

  // Emit Done section
  emitSection('done', done.length);
  if (sectionExpanded('done')) {
    for (const s of done) {
      emitSessionRow(s, 0);
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
