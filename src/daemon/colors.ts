export const ORCHESTRATOR_COLOR = 'yellow';

const AGENT_PALETTE = ['blue', 'green', 'magenta', 'cyan', 'red', 'white'] as const;

const sessionColorIndex = new Map<string, number>();

export function getNextColor(sessionId: string): string {
  const idx = sessionColorIndex.get(sessionId) ?? 0;
  const color = AGENT_PALETTE[idx % AGENT_PALETTE.length]!;
  sessionColorIndex.set(sessionId, idx + 1);
  return color;
}

export function resetColors(sessionId: string): void {
  sessionColorIndex.delete(sessionId);
}
