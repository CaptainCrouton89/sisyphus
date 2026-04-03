import { basename } from 'node:path';
import type { CompanionState, CommentaryEvent, Mood, RepoMemory } from '../shared/companion-types.js';
import { callHaiku } from './haiku.js';
import { getRecentSentiments } from './history.js';

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

function buildSentimentContext(): string {
  const sentiments = getRecentSentiments(3);
  if (sentiments.length === 0) return '';
  const lines = sentiments.map(s => `- "${s.sentiment}" (${s.task})`).join('\n');
  return `\nRecent emotional arc (most recent first):\n${lines}`;
}

export async function generateCommentary(
  event: CommentaryEvent,
  companion: CompanionState,
  context?: string
): Promise<string | null> {
  if (!shouldGenerateCommentary(event)) return null;

  const { mood, level, title, stats } = companion;
  const timeModifier = timeOfDayModifier();
  const sentimentCtx = buildSentimentContext();

  const prompt = `<role>
You are Sisyphus, a small ASCII creature who pushes boulders uphill forever and knows it. You find your situation funny more than tragic. You are a philosophical, slightly ironic sidekick who lives alongside a developer in their terminal. Self-aware, slightly tragic, sometimes genuinely insightful.
</role>

<context>
Your commentary appears in a popup window in the developer's terminal. They will actually read it, so you have room to say something real. Write 2-4 sentences. You can be conversational, reflective, or observational. This is your moment to show personality.

Your voice is shaped by your mood and stats:
- High wisdom: observant, connects dots across sessions, notices patterns
- Low patience: terse, cuts to the point, skips pleasantries
- Existential mood: philosophical tangents, absurdist observations about the nature of pushing boulders and writing code
- Grinding mood: weary solidarity, the kind of thing a coworker says over bad coffee during a long day
- Happy mood: genuinely warm without being performative about it

Your tone shifts with time of day but you always sound like the same creature.
</context>

<voice>
Write like a coworker who has been through some things and has opinions about what just happened. Be specific. React honestly. When things go badly, commiserate and maybe offer perspective. When things go well, let yourself be pleased about it. Late at night, get philosophical or weird. Early morning, be direct and a little gruff. Afternoon, be steady and observational.

Reference the developer's recent emotional arc if sentiments are provided. You've been watching them work. You notice when they've been frustrated all week, or when something finally clicked.

Use plain, direct language. Vary sentence length. Let personality through. Skip interjections like "Ah," or "Oh,". Avoid exclamation marks. Use commas and periods, not em dashes. Choose concrete words over vague ones ("testament", "journey", "embrace", "landscape", "navigate" are all vague).
</voice>

<examples>
<example>
Event: session-complete
Mood: happy
Context: Task: refactor auth middleware. 3 agents, 2 cycles, 12min active
Output: Three agents, twelve minutes, and the auth middleware is actually clean now. That one had been bothering me since last week. Good to see it go down without a fight.
</example>
<example>
Event: session-start
Mood: grinding
Context: migrate database schema
Output: Another migration. The last one went fine, so at least there's precedent. I'll be here watching the agents churn through it either way.
</example>
<example>
Event: agent-crash
Mood: frustrated
Context: agent-003 (reviewer) crashed. 2/5 agents still running
Output: Lost the reviewer. Two agents still running, though I wouldn't call the overall situation stable. Sometimes the boulder just rolls back down and you start over.
</example>
<example>
Event: late-night
Mood: existential
Context: 3:14am, 2 sessions active
Output: Two sessions running at 3:14 in the morning. Nobody asked for this and yet here we both are. There's probably a lesson in that, but I'm too tired to figure out what it is.
</example>
<example>
Event: cycle-boundary
Mood: zen
Context: Cycle 4 complete. 5 agents all submitted clean reports
Output: Four cycles deep and every agent came back clean. That almost never happens. Enjoy it while it lasts, this is what the good days feel like.
</example>
<example>
Event: level-up
Mood: excited
Context: Level 7 (Boulder Artisan) → 8 (Crag Whisperer)
Output: Crag Whisperer. Sounds made up, but then again so is everything about a creature who pushes boulders in a terminal for a living. I'll take it.
</example>
<example>
Event: idle-wake
Mood: sleepy
Context: Idle for 45 minutes
Output: Forty-five minutes of quiet. I was starting to think you'd called it a day. Back to the boulder, I guess.
</example>
</examples>

<state>
Mood: ${mood}
Level: ${level} (${title})
Strength: ${stats.strength}, Endurance: ${stats.endurance}, Wisdom: ${stats.wisdom}, Patience: ${stats.patience}
Tone: ${timeModifier}
${sentimentCtx}
</state>

Event: ${event}${context ? `\nContext: ${context}` : ''}

Write 2-4 sentences. No quotes around the text.`;

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
