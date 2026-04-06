import type { Agent, Session } from './types.js';

/**
 * Return the tracked active time for a session.
 * Active time is accumulated by the daemon's pane monitor, excluding sleep/idle gaps.
 */
export function computeActiveTimeMs(session: Session): number {
  return session.activeMs;
}

/**
 * Find an agent by ID, searching from the end of the array so the most
 * recently appended entry wins when duplicates exist (e.g. after restart).
 */
export function findAgentById(agents: Agent[], agentId: string): Agent | undefined {
  return agents.slice().reverse().find(a => a.id === agentId);
}

/**
 * Strip the `sisyphus:` namespace prefix from an agent type string.
 * Returns the bare type name (e.g. "review", "debug").
 */
export function stripAgentTypePrefix(agentType: string): string {
  return agentType.replace(/^sisyphus:/, '');
}

/**
 * Return a human-readable label for a session: its name if set,
 * otherwise the first 8 characters of the session ID.
 */
export function sessionDisplayLabel(nameOrSession: string | undefined | { name?: string }, sessionId: string): string {
  const name = typeof nameOrSession === 'object' ? nameOrSession?.name : nameOrSession;
  return name ?? sessionId.slice(0, 8);
}

/**
 * Substitute Sisyphus session environment variable placeholders in text.
 * Replaces `$SISYPHUS_SESSION_DIR` and `$SISYPHUS_SESSION_ID` with actual values.
 */
export function substituteSessionEnvVars(text: string, sesDir: string, sessionId: string): string {
  return text
    .replace(/\$SISYPHUS_SESSION_DIR/g, sesDir)
    .replace(/\$SISYPHUS_SESSION_ID/g, sessionId);
}
