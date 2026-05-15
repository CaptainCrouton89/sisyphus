import { getGlobalFlags } from './global-flags.js';

/**
 * Emit a structured success payload to stdout. In --json mode, wraps the data
 * in `{ ok: true, schema_version: 1, data }` so every successful invocation
 * yields a parseable line. Returns true if it printed JSON (caller can skip
 * the prose path), false otherwise.
 *
 *   if (emitJsonOk({ sessionId, agentId })) return;
 *   console.log(`Agent ${agentId} spawned. Next: sis agent await ${agentId}`);
 */
export function emitJsonOk(data: Record<string, unknown> = {}): boolean {
  if (!getGlobalFlags().json) return false;
  process.stdout.write(
    JSON.stringify({ ok: true, schema_version: 1, data }) + '\n',
  );
  return true;
}

/**
 * True if the active invocation requested JSON output. Use to gate prose
 * blocks (status banners, "Next:" hints, multi-line summaries).
 */
export function isJsonMode(): boolean {
  return getGlobalFlags().json;
}
