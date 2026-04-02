import { query } from '@r-cli/sdk';
import { execEnv } from '../shared/env.js';

const COOLDOWN_MS = 5 * 60 * 1000;
let disabledUntil = 0;

export async function callHaiku(prompt: string): Promise<string | null> {
  if (Date.now() < disabledUntil) return null;

  try {
    const session = await query({
      prompt,
      options: {
        model: 'haiku',
        maxTurns: 1,
        env: execEnv(),
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
