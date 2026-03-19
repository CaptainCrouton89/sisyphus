import { rawSend } from '../../shared/client.js';
import type { Request, Response } from '../../shared/protocol.js';

export function send(request: Request): Promise<Response> {
  return rawSend(request, 5_000);
}
