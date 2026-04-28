import type { AskStatus, InteractionKind } from './types.js';

export type { InteractionKind as InboxItemKind };

export function coerceKind(k: InteractionKind | undefined): InteractionKind {
  if (k !== undefined) return k;
  return 'validation';
}

export interface AggregateInboxItem {
  sessionId: string;
  sessionName?: string;
  cwd: string;
  askId: string;
  askedBy: string;
  askedAt: string;
  status: AskStatus;
  blocking: boolean;
  orphaned?: boolean;
  title?: string;
  subtitle?: string;
  blockedSince: string;
  kind?: InteractionKind;
}
