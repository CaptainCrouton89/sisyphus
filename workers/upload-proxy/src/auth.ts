import type { Env, TokenRecord } from './schemas';
import { jsonErr } from './handlers/health';

export async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function authenticate(request: Request, env: Env): Promise<TokenRecord | Response> {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    console.error(JSON.stringify({ event: 'auth_fail', reason: 'no_bearer' }));
    return jsonErr(401, 'unauthorized');
  }
  const plaintext = auth.slice(7);
  const hash = await sha256hex(plaintext);
  const record = await env.TOKENS.get<TokenRecord>(`token:${hash}`, 'json');
  if (!record || record.revoked) {
    console.error(JSON.stringify({ event: 'auth_fail', reason: record ? 'revoked' : 'not_found', hash: hash.slice(0, 8) }));
    return jsonErr(401, 'unauthorized');
  }
  return record;
}
