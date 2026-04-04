import { query } from '@r-cli/sdk';
import type { ZodSchema } from 'zod';
import { execEnv } from '../shared/env.js';

const COOLDOWN_MS = 5 * 60 * 1000;
let disabledUntil = 0;

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
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      disabledUntil = Date.now() + COOLDOWN_MS;
    }
    return null;
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
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      disabledUntil = Date.now() + COOLDOWN_MS;
    }
    return null;
  }
}
