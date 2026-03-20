import { query } from '@r-cli/sdk';

let disabled = false;

/**
 * Summarize an agent report using Haiku via the SDK.
 * Returns a clean one-sentence summary, or null if unavailable.
 * Non-blocking: callers should fire-and-forget.
 */
/**
 * Generate a short kebab-case session name from the task description.
 * Non-blocking: callers should fire-and-forget.
 */
export async function generateSessionName(task: string): Promise<string | null> {
  if (disabled) return null;

  try {
    const session = await query({
      prompt: `Generate a 2-4 word kebab-case name for this task. Output ONLY the name.\n\n${task.slice(0, 500)}`,
      options: {
        model: 'haiku',
        maxTurns: 1,
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

    const name = text.trim().toLowerCase();
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return null;
    return name.slice(0, 30);
  } catch (err) {
    console.error(`[sisyphus] Haiku name generation failed: ${err instanceof Error ? err.message : err}`);
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      disabled = true;
    }
    return null;
  }
}

export async function summarizeReport(reportText: string): Promise<string | null> {
  if (disabled) return null;

  try {
    const session = await query({
      prompt: `Summarize this agent work report in one concise sentence (max 120 chars). Focus on what was accomplished and the outcome. Output ONLY the summary sentence, nothing else.\n\n${reportText.slice(0, 3000)}`,
      options: {
        model: 'haiku',
        maxTurns: 1,
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

    const summary = text.trim();
    return summary.length > 0 ? summary : null;
  } catch (err) {
    console.error(`[sisyphus] Haiku summarization failed: ${err instanceof Error ? err.message : err}`);
    // Disable on auth failures
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      disabled = true;
    }
    return null;
  }
}
