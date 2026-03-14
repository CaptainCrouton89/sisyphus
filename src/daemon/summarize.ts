import { query } from '@r-cli/sdk';

let disabled = false;

/**
 * Summarize an agent report using Haiku via the SDK.
 * Returns a clean one-sentence summary, or null if unavailable.
 * Non-blocking: callers should fire-and-forget.
 */
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
