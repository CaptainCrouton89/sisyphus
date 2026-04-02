import { callHaiku } from './haiku.js';

/**
 * Generate a short kebab-case session name from the task description.
 * Non-blocking: callers should fire-and-forget.
 */
export async function generateSessionName(task: string): Promise<string | null> {
  const text = await callHaiku(
    `Generate a 2-4 word kebab-case name for this task. Output ONLY the name.\n\n${task.slice(0, 500)}`
  );
  if (!text) return null;
  const name = text.toLowerCase();
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return null;
  return name.slice(0, 30);
}

/**
 * Summarize an agent report using Haiku via the SDK.
 * Returns a clean one-sentence summary, or null if unavailable.
 * Non-blocking: callers should fire-and-forget.
 */
export async function summarizeReport(reportText: string): Promise<string | null> {
  const text = await callHaiku(
    `Summarize this agent work report in one concise sentence (max 120 chars). Focus on what was accomplished and the outcome. Output ONLY the summary sentence, nothing else.\n\n${reportText.slice(0, 3000)}`
  );
  if (!text) return null;
  return text.length > 0 ? text : null;
}
