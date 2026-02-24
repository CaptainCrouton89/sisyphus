export const ORCHESTRATOR_COLOR = 'yellow';

const AGENT_PALETTE = ['blue', 'green', 'magenta', 'cyan', 'red', 'white'] as const;

const TMUX_COLOR_MAP: Record<string, string> = {
  orange: 'colour208',
  teal: 'colour6',
};

export function normalizeTmuxColor(color: string): string {
  return TMUX_COLOR_MAP[color] ?? color;
}

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

