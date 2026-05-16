import { rawSend } from '../../shared/client.js';
import type { Request, Response } from '../../shared/protocol.js';
import type { InboxItem } from '../../shared/inbox-types.js';

export function send(request: Request): Promise<Response> {
  return rawSend(request, 8_000);
}

export async function inboxList(): Promise<(InboxItem & { sessionName?: string })[]> {
  const res = await send({ type: 'inbox-list' });
  if (!res.ok) return [];
  return (res.data?.items as (InboxItem & { sessionName?: string })[] | undefined) ?? [];
}
