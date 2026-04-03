import { callHaiku } from './haiku.js';

/**
 * Generate a one-sentence sentiment read for the session.
 * Non-blocking: callers should fire-and-forget.
 */
export async function generateSentiment(task: string, messages: string[]): Promise<string | null> {
  const taskSlice = task.slice(0, 1000);
  const messagesSlice = messages.slice(0, 10).map(m => m.slice(0, 500)).join('\n');
  const text = await callHaiku(
    `Read this session's task and user messages. Write one sentence capturing how the user felt about this work — their emotional register, not what they did. Be specific and human. Examples: 'Frustrated with architectural debt but energized about the redesign.' 'Calm, methodical debugging of a customer escalation.' 'Ambitious and patient — willing to invest in doing it right.'\n\nTask: ${taskSlice}\n\nMessages:\n${messagesSlice}`,
  );
  if (!text) return null;
  return text.slice(0, 200);
}

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
