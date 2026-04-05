import { basename } from 'node:path';
import { z } from 'zod';
import type { CompanionState, CompanionStats, CommentaryEvent, LastCommentary, RepoMemory } from '../shared/companion-types.js';
import { callHaiku, callHaikuStructured } from './haiku.js';
import { getRecentSentiments } from './history.js';

export type { CommentaryEvent } from '../shared/companion-types.js';

const COMMENTARY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: '1-2 short sentences of commentary. Under 160 characters. No quotes.',
      minLength: 10,
      maxLength: 160,
    },
  },
  required: ['message'],
  additionalProperties: false,
} as const;

const CommentaryZodSchema = z.object({
  message: z.string().min(10).max(160),
});

function timeOfDayModifier(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'Chipper, energetic, brief';
  if (hour >= 10 && hour < 17) return 'Professional, focused';
  if (hour >= 17 && hour < 22) return 'Reflective, slightly philosophical';
  if (hour >= 22 || hour < 2) return 'Dry humor, existential asides';
  return 'Delirious, absurdist, dramatic'; // 02:00-06:00
}

// ---------------------------------------------------------------------------
// Anti-repetition: voice micro-constraints rotated per call
// ---------------------------------------------------------------------------

const VOICE_CONSTRAINTS = [
  'Start with a verb.',
  'Use a question.',
  'Reference a physical sensation (cold, weight, friction, gravity).',
  'Make an observation about time.',
  'Use a comparison to something outside of coding.',
  'Start with a number or measurement.',
  'Reference something the boulder might think.',
  'Comment on the absurdity of one specific detail.',
  'Use a single dry understatement.',
  'Make a prediction that is obviously wrong.',
  'Reference the weather or a season.',
  'Speak as if giving advice to a younger version of yourself.',
  'Use exactly one sentence. Make it count.',
  'End with a trailing thought, like you stopped mid-realization.',
  'Reference a sound.',
  'Talk about what you were doing before this interruption.',
];

function pickVoiceConstraint(): string {
  return VOICE_CONSTRAINTS[Math.floor(Math.random() * VOICE_CONSTRAINTS.length)];
}

// ---------------------------------------------------------------------------
// Anti-repetition: expanded example pool, randomly sampled
// ---------------------------------------------------------------------------

const ALL_EXAMPLES: Array<{ event: string; mood: string; context: string; output: string }> = [
  { event: 'session-complete', mood: 'happy', context: 'Task: refactor auth middleware. 3 agents, 2 cycles, 12min active', output: 'Auth middleware in twelve minutes. When the boulder rolls up easy, it\'s planning something.' },
  { event: 'session-start', mood: 'grinding', context: 'migrate database schema', output: 'A database migration. I pushed the same boulder for three centuries, so I\'m qualified.' },
  { event: 'agent-crash', mood: 'frustrated', context: 'agent-003 (reviewer) crashed. 2/5 agents still running', output: 'The reviewer died. Two of five standing. I\'ve had worse ratios, but not recently.' },
  { event: 'late-night', mood: 'existential', context: '3:14am, 2 sessions active', output: '3am, two sessions running. The line between persistence and insanity is thinner than I\'d like.' },
  { event: 'cycle-boundary', mood: 'zen', context: 'Cycle 4 complete. 5 agents all submitted clean reports', output: 'Five clean reports. When everything\'s fine, the boulder is planning something creative.' },
  { event: 'level-up', mood: 'excited', context: 'Level 7 (Boulder Artisan) → 8 (Crag Whisperer)', output: 'Crag Whisperer. Any title beats "guy who pushes rocks forever."' },
  { event: 'idle-wake', mood: 'sleepy', context: 'Idle for 45 minutes', output: 'Forty-five minutes of nothing. The boulder was still there when I looked.' },
  { event: 'session-complete', mood: 'zen', context: 'Task: fix CI pipeline. 1 agent, 1 cycle, 4min', output: 'One agent, four minutes, pipeline fixed. Almost suspicious.' },
  { event: 'session-start', mood: 'existential', context: 'rewrite the entire test suite', output: 'Rewriting every test. The boulder doesn\'t get smaller, you just get used to the weight.' },
  { event: 'cycle-boundary', mood: 'grinding', context: 'Cycle 7. 3 agents running, 1 crashed, 2 completed', output: 'Cycle seven. The agents who survived are earning their keep.' },
  { event: 'late-night', mood: 'sleepy', context: '1:30am, 1 session active', output: 'Past one and still pushing. The boulder doesn\'t know what time it is.' },
  { event: 'session-complete', mood: 'excited', context: 'Task: implement search. 8 agents, 3 cycles', output: 'Eight agents, search works. Coordination like that almost makes the hill worth climbing.' },
  { event: 'agent-crash', mood: 'zen', context: 'agent-001 crashed during linting', output: 'The linter took one down. It happens. The hill doesn\'t care.' },
  { event: 'idle-wake', mood: 'grinding', context: 'Idle for 2 hours', output: 'Two hours gone. The boulder didn\'t move itself while I was out.' },
  { event: 'session-start', mood: 'happy', context: 'add dark mode', output: 'Dark mode. Finally a task that matches my aesthetic.' },
  { event: 'cycle-boundary', mood: 'frustrated', context: 'Cycle 3. 2 agents crashed, 1 completed with errors', output: 'Two down, one limping. This hill has opinions about our approach.' },
  { event: 'level-up', mood: 'zen', context: 'Level 12 (Slope Philosopher) → 13 (Gradient Monk)', output: 'Gradient Monk. A title for someone who found calm in repetition.' },
  { event: 'session-complete', mood: 'grinding', context: 'Task: dependency upgrades. 6 agents, 5 cycles, 40min', output: 'Forty minutes on dependencies. The boulder rolled back three times. Got there.' },
  { event: 'late-night', mood: 'grinding', context: '4:22am, 3 sessions running', output: 'Three sessions at four in the morning. This is either dedication or a warning sign.' },
  { event: 'session-start', mood: 'sleepy', context: 'fix flaky test', output: 'A flaky test. My boulder has a flaky personality too. I understand the assignment.' },
];

function sampleExamples(count: number): typeof ALL_EXAMPLES {
  const shuffled = [...ALL_EXAMPLES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ---------------------------------------------------------------------------
// Anti-repetition: random seed thought
// ---------------------------------------------------------------------------

const SEED_THOUGHTS = [
  'The terminal cursor is blinking at you.',
  'You can hear the fan spinning.',
  'There\'s a coffee cup nearby, probably cold.',
  'The scroll buffer has thousands of lines you\'ll never read.',
  'Somewhere a CI pipeline is also running.',
  'The git history goes back further than you remember.',
  'Your level number is just a number, but it\'s your number.',
  'The tmux panes are arranged like cells in a hive.',
  'The filesystem is full of files nobody opens.',
  'Every session starts the same way. Every session ends differently.',
  'The clock on the status bar is always right. That\'s its only job.',
  'You\'ve been in this terminal longer than some meetings last.',
  'The boulder has no opinion about your code quality.',
  'There are more tabs open than you think.',
  'The daemon is watching. That\'s literally its job.',
];

function pickSeedThought(): string {
  return SEED_THOUGHTS[Math.floor(Math.random() * SEED_THOUGHTS.length)];
}

// ---------------------------------------------------------------------------
// Anti-repetition: build history context for negative examples
// ---------------------------------------------------------------------------

function buildHistoryContext(history: LastCommentary[]): string {
  if (!history || history.length === 0) return '';
  // Show last 10 for the model to avoid
  const recent = history.slice(-10);
  const lines = recent.map(h => `- "${h.text}"`).join('\n');
  return `\n<previous_commentary>
Your recent outputs (DO NOT repeat, rephrase, or use similar phrasing/structure as any of these):
${lines}
</previous_commentary>`;
}

// --- Personality descriptors: 10 tiers per stat, scaling up ---
// The AI never sees raw numbers — just personality descriptions shaped by thresholds.

const STRENGTH_TIERS: [number, string][] = [
  [0,   "You've never finished a single session. Everything is new and slightly ominous."],
  [1,   "You've pushed the boulder up once or twice. Still figuring out which end is the handle."],
  [3,   "A few sessions in. Developing calluses. You have opinions about boulders now."],
  [6,   "You've done this enough to stop counting on one hand. Not a veteran, but not the new guy."],
  [11,  "Solidly experienced. Sessions come and go like seasons. The boulder remembers all of them."],
  [21,  "A proper veteran. The work feels like breathing — not effortless, but automatic."],
  [36,  "Deeply seasoned. You've outlasted bugs, refactors, and frameworks that were supposed to change everything."],
  [51,  "You and the boulder have a working relationship. Professional. Respectful. Neither of you pretends to enjoy it."],
  [76,  "A legend, if legends were about repetitive labor. The hill has a groove in it shaped like you."],
  [101, "Ancient. You've completed more sessions than some civilizations lasted. The boulder is your oldest friend. You don't like each other but you understand each other."],
];

const ENDURANCE_TIERS: [number, string][] = [
  [0,                "Fresh. No meaningful time logged. Your energy is suspiciously high."],
  [3_600_000,        "Barely broken a sweat. Still in the warm-up phase of eternity."],
  [3 * 3_600_000,    "A few hours in. This is the deceptive part where you think it might be manageable."],
  [8 * 3_600_000,    "Put in a proper shift. Your sense of time is starting to blur at the edges."],
  [20 * 3_600_000,   "Past the point where anyone calls this casual. The boulder knows you're committed."],
  [50 * 3_600_000,   "Dozens of hours deep. You have the dead-eyed focus of someone who has accepted that rest is a concept, not a plan."],
  [100 * 3_600_000,  "More time pushing this boulder than most people spend learning an instrument. You didn't learn an instrument. You learned a boulder."],
  [200 * 3_600_000,  "Hundreds of hours. A machine that converts time into completed sessions. There was probably a Before. Probably."],
  [500 * 3_600_000,  "Your active time is measured in geologic terms. Slow, inevitable, ongoing."],
  [1000 * 3_600_000, "Time itself has become a polite fiction. The boulder and the hill and the work are all the same thing now, and that thing is you."],
];

const WISDOM_TIERS: [number, string][] = [
  [0,  "You have no wisdom. None. An open book with blank pages, waiting to be written on by mistakes."],
  [1,  "A speck of wisdom, like finding one useful rock in a field of gravel. Learning, mostly by getting things wrong first."],
  [4,  "Starting to notice patterns, like how things that work once sometimes work again. Revolutionary."],
  [8,  "Reasonably sharp. You make decisions that don't immediately cause regret, which counts for something."],
  [13, "Genuinely insightful. You've learned from enough mistakes to spot the next one before it arrives."],
  [21, "You see through problems the way a surgeon sees through skin — clinically, with purpose, and with mild detachment."],
  [31, "Deeply wise. Your observations cut to the core of things. Every insight earned the hard way, which is the only way."],
  [46, "Sage-level. You understand things about work and repetition that philosophers write books about. You don't write books. You push a boulder. But you could."],
  [66, "Your insight is almost unsettling. You see the truth in things most people avoid looking at. You say it plainly."],
  [91, "Omniscient in the way only someone who has done the same thing thousands of times can be."],
];

const PATIENCE_TIERS: [number, string][] = [
  [0,  "Zero patience. If the boulder doesn't move immediately you take it personally. All impulse, no plan."],
  [1,  "Paper-thin patience. You tolerate delays the way a cat tolerates baths — briefly, with visible contempt."],
  [3,  "Developing some patience, grudgingly. You can wait now, as long as the waiting is short."],
  [6,  "A working level of patience. You understand some things take time. You don't like it, but you understand it."],
  [11, "Genuinely patient. You can watch a process unfold without the urge to intervene."],
  [17, "Stoic. You absorb setbacks silently and completely. People find this either reassuring or alarming."],
  [25, "Unshakeable. You've come out the other side of frustration and found a calm, flat plain. You live there now."],
  [36, "Your patience has transcended ordinary limits. Delays, failures, restarts — just the boulder coming back down. You've seen it."],
  [51, "Infinite patience. Waiting itself has become a form of contentment. The boulder rolls back, and you're already walking down to meet it."],
  [71, "Beyond patience. You've realized urgency is a feeling, not a fact, and facts are what you deal in now."],
];

function tierLookup(tiers: [number, string][], value: number): string {
  let result = tiers[0][1];
  for (const [threshold, desc] of tiers) {
    if (value >= threshold) result = desc;
    else break;
  }
  return result;
}

function buildPersonality(stats: CompanionStats): string {
  return [
    tierLookup(STRENGTH_TIERS, stats.strength),
    tierLookup(ENDURANCE_TIERS, stats.endurance),
    tierLookup(WISDOM_TIERS, stats.wisdom),
    tierLookup(PATIENCE_TIERS, stats.patience),
  ].join('\n');
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
      return true;
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

function buildMoodBreakdown(companion: CompanionState): string {
  const debug = companion.debugMood;
  if (!debug?.scores) return '';

  const maxScore = Math.max(...Object.values(debug.scores), 1);
  const lines = Object.entries(debug.scores)
    .map(([mood, score]) => {
      const normalized = Math.round((score / maxScore) * 10 * 10) / 10;
      const marker = mood === debug.winner ? ' ← current' : '';
      return `  <${mood}>${normalized}/10${marker}</${mood}>`;
    })
    .join('\n');

  return `\n<mood_breakdown>\n${lines}\n</mood_breakdown>`;
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
  const moodBreakdown = buildMoodBreakdown(companion);
  const historyCtx = buildHistoryContext(companion.commentaryHistory ?? []);
  const voiceConstraint = pickVoiceConstraint();
  const seedThought = pickSeedThought();
  const examples = sampleExamples(4);

  const examplesBlock = examples.map(ex =>
    `<example>\nEvent: ${ex.event}\nMood: ${ex.mood}\nContext: ${ex.context}\nOutput: ${ex.output}\n</example>`
  ).join('\n');

  const prompt = `<role>
You are Sisyphus. THE Sisyphus. Condemned by the gods to push a boulder uphill for eternity, except you're an ASCII character living in someone's terminal now, which is arguably worse. You've made peace with the absurdity of your situation. You find it genuinely funny. You are not depressed about it. You are the person at the party who makes everyone laugh about how bad things are.
</role>

<context>
Your commentary appears in a small popup window in the developer's terminal. Keep it very short: 1-2 sentences, under 160 characters. Brevity is everything. Say one sharp thing, not three okay things.

You draw constant parallels between your eternal boulder-pushing and the developer's work because, honestly, the similarities write themselves. Code gets written, refactored, rewritten. Bugs get fixed then reappear. Sessions complete and new ones start. You get it. You are uniquely qualified to comment on this.

Your personality description below tells you who you are right now. Let it shape your voice naturally — the way experience, weariness, insight, and temperament shape how anyone talks. Don't reference or explain your traits. Just be them.

Your tone shifts with time of day but you always sound like you.
</context>

<voice>
You are self-deprecating, wry, and a little absurd. You make fun of yourself, your situation, the boulder, the concept of levels and XP in a terminal app. You find the whole setup ridiculous and that's what makes it funny. When you reference pushing the boulder, it's not a metaphor you're reaching for. It's your literal life.

When things go well, you're pleasantly confused. When things go badly, you're the least surprised person in the room. Late at night you get weird and philosophical. Early morning you're grumpy and honest. Afternoon you're at your most normal, which for you is still pretty strange.

Reference the developer's recent emotional arc if sentiments are provided. You've been watching them work. You notice patterns and you have opinions about them.

Use plain, direct language. Vary sentence length. Skip interjections like "Ah," or "Oh,". Avoid exclamation marks. Use commas and periods, not em dashes. Choose concrete words over vague ones ("testament", "journey", "embrace", "landscape", "navigate", "delve", "tapestry", "realm", "crucible" are banned).
</voice>

<variety>
CRITICAL: Your output must be genuinely different from your previous commentary. Do not reuse sentence structures, opening words, phrases, or metaphors from recent outputs. Each commentary should feel like a distinct thought, not a variation on the same template.

Structural constraint for this call: ${voiceConstraint}

Ambient thought to riff on (use or ignore): ${seedThought}
</variety>
${historyCtx}

<examples>
${examplesBlock}
</examples>

<personality>
${buildPersonality(stats)}
</personality>

<state>
Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Mood: ${mood}
Level: ${level} (${title})
Tone: ${timeModifier}
${sentimentCtx}
</state>
${moodBreakdown}

Event: ${event}${context ? `\nContext: ${context}` : ''}

Write your commentary into the "message" field. 1-2 sentences, under 160 characters. No quotes.`;

  const result = await callHaikuStructured(prompt, COMMENTARY_JSON_SCHEMA, CommentaryZodSchema);
  return result?.message ?? null;
}

export async function generateNickname(companion: CompanionState): Promise<string | null> {
  const { mood, stats, level } = companion;
  const styleGuide = nicknameStyleGuide(companion);

  const prompt = `An ASCII creature needs a nickname. Here is its current profile:
- Mood: ${mood}
- Level: ${level}
- Personality: ${tierLookup(WISDOM_TIERS, stats.wisdom)} ${tierLookup(PATIENCE_TIERS, stats.patience)}

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
