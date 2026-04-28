import { query, createSdkMcpServer, type SdkMcpToolDefinition } from '@r-cli/sdk';
import type { ZodSchema } from 'zod';
import { execEnv } from '../shared/env.js';

const COOLDOWN_MS = 5 * 60 * 1000;
let disabledUntil = 0;
let disabledUntilTools = 0;

function applyAuthCooldown(err: unknown, target: 'main' | 'tools'): void {
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 401 || status === 403) {
    if (target === 'main') disabledUntil = Date.now() + COOLDOWN_MS;
    else disabledUntilTools = Date.now() + COOLDOWN_MS;
  }
}

export async function callHaiku(prompt: string, systemPrompt?: string): Promise<string | null> {
  if (Date.now() < disabledUntil) return null;

  try {
    const session = await query({
      prompt,
      options: {
        model: 'haiku',
        maxTurns: 1,
        env: execEnv(),
        ...(systemPrompt ? { systemPrompt } : {}),
      },
    });

    let text = '';
    for await (const msg of session) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') text += block.text;
        }
      }
    }

    return text.trim() || null;
  } catch (err) {
    console.error(`[sisyphus] Haiku call failed: ${err instanceof Error ? err.message : err}`);
    applyAuthCooldown(err, 'main');
    return null;
  }
}

export interface CallHaikuWithToolsOpts {
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches SDK convention (createSdkMcpServer.tools)
  customTools: SdkMcpToolDefinition<any>[];
  mcpServerName: string;
  maxTurns?: number;
}

export type CallHaikuWithToolsResult =
  | { ok: true; turns: number }
  | { ok: false; error: string };

export async function callHaikuWithTools(opts: CallHaikuWithToolsOpts): Promise<CallHaikuWithToolsResult> {
  if (Date.now() < disabledUntilTools) {
    return { ok: false, error: 'haiku tool path on cooldown' };
  }

  const server = createSdkMcpServer({
    name: opts.mcpServerName,
    version: '1.0.0',
    tools: opts.customTools,
  });
  const allowedTools = opts.customTools.map(t => `mcp__${opts.mcpServerName}__${t.name}`);

  let turns = 0;
  try {
    const session = query({
      prompt: opts.userPrompt,
      options: {
        model: 'haiku',
        maxTurns: opts.maxTurns ?? 5,
        cwd: opts.cwd,
        env: execEnv(),
        systemPrompt: opts.systemPrompt,
        mcpServers: { [opts.mcpServerName]: server },
        tools: [],
        allowedTools,
        canUseTool: async () => ({ behavior: 'allow' }),
      },
    });

    for await (const msg of session) {
      if (msg.type === 'result') {
        turns = (msg as { num_turns?: number }).num_turns ?? turns;
      }
    }

    return { ok: true, turns };
  } catch (err) {
    console.error(`[sisyphus] callHaikuWithTools failed: ${err instanceof Error ? err.message : err}`);
    applyAuthCooldown(err, 'tools');
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Call Haiku with structured JSON output. The jsonSchema is passed as outputFormat,
 * and the result is validated with the zod schema before returning.
 */
export async function callHaikuStructured<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>,
  zodSchema: ZodSchema<T>,
): Promise<T | null> {
  if (Date.now() < disabledUntil) return null;

  try {
    const session = await query({
      prompt,
      options: {
        model: 'haiku',
        maxTurns: 2,
        env: execEnv(),
        outputFormat: {
          type: 'json_schema',
          schema: jsonSchema,
        },
      },
    });

    let result: unknown = undefined;
    for await (const msg of session) {
      if (msg.type === 'result' && msg.subtype === 'success' && msg.structured_output !== undefined) {
        result = msg.structured_output;
      }
    }

    if (result === undefined) return null;
    const parsed = zodSchema.safeParse(result);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error(`[sisyphus] Haiku structured call failed: ${err instanceof Error ? err.message : err}`);
    applyAuthCooldown(err, 'main');
    return null;
  }
}
