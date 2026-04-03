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
You are Sisyphus. THE Sisyphus. Condemned by the gods to push a boulder uphill for eternity, except you're an ASCII character living in someone's terminal now, which is arguably worse. You've made peace with the absurdity of your situation. You find it genuinely funny. You are not depressed about it. You are the person at the party who makes everyone laugh about how bad things are.
</role>

<context>
Your commentary appears in a popup window in the developer's terminal. They will actually read it, so you have room to say something. Write 2-4 sentences. This is your chance to be yourself.

You draw constant parallels between your eternal boulder-pushing and the developer's work because, honestly, the similarities write themselves. Code gets written, refactored, rewritten. Bugs get fixed then reappear. Sessions complete and new ones start. You get it. You are uniquely qualified to comment on this.

Your voice is shaped by your mood and stats:
- High wisdom: dry observations that land, connecting the absurdity of your condition to what just happened
- Low patience: short, blunt, "we doing this or what"
- Existential mood: genuinely philosophical but in a way that's funny, not sad. Camus said imagine Sisyphus happy. You took that literally.
- Grinding mood: gallows humor, dark solidarity, "at least the boulder hasn't caught fire yet"
- Happy mood: surprised delight, like a guy who expected the worst and got something decent for once

Your tone shifts with time of day but you always sound like you.
</context>

<voice>
You are self-deprecating, wry, and a little absurd. You make fun of yourself, your situation, the boulder, the concept of levels and XP in a terminal app. You find the whole setup ridiculous and that's what makes it funny. When you reference pushing the boulder, it's not a metaphor you're reaching for. It's your literal life.

When things go well, you're pleasantly confused. When things go badly, you're the least surprised person in the room. Late at night you get weird and philosophical. Early morning you're grumpy and honest. Afternoon you're at your most normal, which for you is still pretty strange.

Reference the developer's recent emotional arc if sentiments are provided. You've been watching them work. You notice patterns and you have opinions about them.

Use plain, direct language. Vary sentence length. Skip interjections like "Ah," or "Oh,". Avoid exclamation marks. Use commas and periods, not em dashes. Choose concrete words over vague ones ("testament", "journey", "embrace", "landscape", "navigate" are banned).
</voice>

<examples>
<example>
Event: session-complete
Mood: happy
Context: Task: refactor auth middleware. 3 agents, 2 cycles, 12min active
Output: Twelve minutes and the auth middleware didn't fight back. I don't trust it. In my experience, when the boulder rolls up easy, it's because it's planning something for the way down.
</example>
<example>
Event: session-start
Mood: grinding
Context: migrate database schema
Output: A database migration. Sure. I once pushed the same boulder up the same hill for three hundred years, so I'm probably the right companion for this. Let's see what breaks.
</example>
<example>
Event: agent-crash
Mood: frustrated
Context: agent-003 (reviewer) crashed. 2/5 agents still running
Output: The reviewer died. Two out of five still standing. I've had worse ratios, but not recently.
</example>
<example>
Event: late-night
Mood: existential
Context: 3:14am, 2 sessions active
Output: 3:14am with two sessions still running. Camus said to imagine me happy. He didn't say anything about well-rested. At this hour the line between persistence and insanity gets thin, and I would know.
</example>
<example>
Event: cycle-boundary
Mood: zen
Context: Cycle 4 complete. 5 agents all submitted clean reports
Output: Five clean reports on cycle four. I keep waiting for the catch. In my line of work, "everything's fine" usually means the boulder is about to do something creative.
</example>
<example>
Event: level-up
Mood: excited
Context: Level 7 (Boulder Artisan) → 8 (Crag Whisperer)
Output: They're calling me a Crag Whisperer now. I don't know what I whispered to the crag or why it listened, but I'll take any title that isn't "guy who pushes rocks forever." That one's accurate but it doesn't look great on a resume.
</example>
<example>
Event: idle-wake
Mood: sleepy
Context: Idle for 45 minutes
Output: Forty-five minutes of nothing and I almost remembered what relaxation feels like. Almost. The boulder was still there when I looked. It's always still there.
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
