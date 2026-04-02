import { basename } from 'node:path';
import type { CompanionState, CommentaryEvent, Mood, RepoMemory } from '../shared/companion-types.js';
import { callHaiku } from './haiku.js';

export type { CommentaryEvent } from '../shared/companion-types.js';

function timeOfDayModifier(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'Chipper, energetic, brief';
  if (hour >= 10 && hour < 17) return 'Professional, focused';
  if (hour >= 17 && hour < 22) return 'Reflective, slightly philosophical';
  if (hour >= 22 || hour < 2) return 'Dry humor, existential asides';
  return 'Delirious, absurdist, dramatic'; // 02:00-06:00
}

function shouldGenerateCommentary(event: CommentaryEvent): boolean {
  switch (event) {
    case 'session-start':
    case 'session-complete':
    case 'level-up':
    case 'achievement':
    case 'late-night':
      return true;
    case 'cycle-boundary':
    case 'idle-wake':
      return Math.random() < 0.5;
    case 'agent-crash':
      return Math.random() < 0.3;
  }
}

function nicknameStyleGuide(companion: CompanionState): string {
  const { mood, stats, level } = companion;

  if (level >= 15) return 'legendary names (Prometheus, Orpheus, Icarus)';

  if (mood === 'happy' && stats.wisdom > 7) return 'mythological names (Atlas, Hermes, Arachne)';
  if (mood === 'frustrated' && stats.patience < 4) return 'blunt functional names (Fix-It, Patch, Leftovers)';
  if (mood === 'zen' && stats.patience > 7) return 'nature names (River, Stone, Cedar, Moss)';
  if (mood === 'excited' && stats.strength > 7) return 'heroic names (Vanguard, Striker, Apex)';
  if (mood === 'existential') return 'abstract names (Echo, Void, Loop, Why)';
  if (mood === 'grinding' && stats.endurance > 7) return 'workhorse names (Steady, Grind, Anvil, Ox)';
  if (mood === 'sleepy') return 'drowsy names (Mumble, Blink, Yawn, Doze)';
  // Fallback defaults
  return 'short punchy names fitting the creature\'s current state';
}

export async function generateCommentary(
  event: CommentaryEvent,
  companion: CompanionState,
  context?: string
): Promise<string | null> {
  if (!shouldGenerateCommentary(event)) return null;

  const { mood, level, title, stats } = companion;
  const timeModifier = timeOfDayModifier();

  const prompt = `You are a small ASCII creature who pushes boulders for a living. You are self-aware about your Sisyphean condition but mostly at peace with it. You speak in 1-2 short sentences. Your voice is shaped by your mood and stats. High wisdom: insightful. Low patience: impatient and blunt. Existential mood: philosophical non-sequiturs. Never break character. Never use emojis.

Current state:
- Mood: ${mood}
- Level: ${level} (${title})
- Strength: ${stats.strength}, Endurance: ${stats.endurance}, Wisdom: ${stats.wisdom}, Patience: ${stats.patience}

Tone for this time of day: ${timeModifier}

Event: ${event}${context ? `\nContext: ${context}` : ''}

Respond with 1-2 sentences only. No quotes around the text.`;

  const raw = await callHaiku(prompt);
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  return trimmed;
}

export async function generateNickname(companion: CompanionState): Promise<string | null> {
  const { mood, stats, level } = companion;
  const styleGuide = nicknameStyleGuide(companion);

  const prompt = `An ASCII creature needs a nickname. Here is its current profile:
- Mood: ${mood}
- Level: ${level}
- Strength: ${stats.strength}, Endurance: ${stats.endurance}, Wisdom: ${stats.wisdom}, Patience: ${stats.patience}

Naming style: ${styleGuide}

Generate a single agent nickname. One word only. No quotes, no explanation.`;

  const raw = await callHaiku(prompt);
  if (!raw) return null;

  const word = raw.trim().split(/\s+/)[0];
  if (!word) return null;

  return word.length > 20 ? word.slice(0, 20) : word;
}

export async function generateRepoNickname(repoPath: string, memory: RepoMemory): Promise<string | null> {
  const repoName = basename(repoPath);
  const moodLabel = memory.moodAvg > 0.6 ? 'mostly positive' : memory.moodAvg > 0.3 ? 'mixed' : 'mostly negative';

  const prompt = `Generate a 1-2 word nickname for a code repository based on its work history.

Repository: ${repoName}
Visit count: ${memory.visits}
Completed sessions: ${memory.completions}
Crashed sessions: ${memory.crashes}
Overall mood: ${moodLabel} (${memory.moodAvg.toFixed(2)})

Generate a 1-2 word nickname for this repository based on the work history there. Affectionate or wary depending on crash rate and mood. No quotes, no explanation.`;

  const raw = await callHaiku(prompt);
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  return trimmed.length > 30 ? trimmed.slice(0, 30) : trimmed;
}
