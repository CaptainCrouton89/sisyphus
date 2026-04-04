import { callHaiku } from './haiku.js';

export interface SentimentInput {
  task: string;
  completionReport?: string;
  agentCount: number;
  cycleCount: number;
  crashCount: number;
  activeMs: number;
  messages: string[];
}

const SENTIMENT_SYSTEM = 'You are a concise text generator. Output only what is asked for, nothing else.';

/**
 * Generate a one-sentence sentiment read for the session.
 * Non-blocking: callers should fire-and-forget.
 */
export async function generateSentiment(input: SentimentInput): Promise<string | null> {
  const parts: string[] = [];
  parts.push(`Task: ${input.task.slice(0, 500)}`);
  if (input.completionReport) {
    parts.push(`Outcome: ${input.completionReport.slice(0, 500)}`);
  }
  const hours = (input.activeMs / 3_600_000).toFixed(1);
  parts.push(`Stats: ${input.agentCount} agents, ${input.cycleCount} cycles, ${input.crashCount} crashes, ${hours}h active`);
  if (input.messages.length > 0) {
    parts.push(`User messages:\n${input.messages.slice(0, 5).map(m => m.slice(0, 300)).join('\n')}`);
  }
  const text = await callHaiku(
    `Write one sentence capturing how the developer likely felt about this coding session — their emotional register, not what they did. Be specific and human. Examples: 'Frustrated with architectural debt but energized about the redesign.' 'Calm, methodical debugging of a customer escalation.' 'Ambitious and patient — willing to invest in doing it right.'\n\n${parts.join('\n\n')}`,
    SENTIMENT_SYSTEM,
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
