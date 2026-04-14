#!/usr/bin/env node --import tsx
/**
 * Generate sample commentary outputs to evaluate prompt quality.
 * Usage: node --import tsx scripts/test-commentary.ts [count] [event]
 *   count: number of outputs to generate (default 10)
 *   event: commentary event type (default cycles through all)
 */
import { generateCommentary } from '../src/daemon/companion-commentary.js';
import type { CompanionState, CommentaryEvent, Mood } from '../src/shared/companion-types.js';

const count = parseInt(process.argv[2] || '10', 10);
const eventFilter = process.argv[3] as CommentaryEvent | undefined;

const EVENTS: CommentaryEvent[] = [
  'cycle-boundary', 'session-complete', 'late-night', 'session-start',
  'agent-crash', 'level-up', 'idle-wake',
];

const MOODS: Mood[] = ['happy', 'grinding', 'frustrated', 'zen', 'sleepy', 'excited', 'existential'];

const CONTEXTS: Record<CommentaryEvent, string[]> = {
  'cycle-boundary': [
    'Cycle 3 complete. 4 agents, all clean reports.',
    'Cycle 7. 2 agents crashed, 3 completed.',
    'Cycle 12 complete. 8 agents all submitted.',
    'Cycle 2 complete. 1 agent, clean report.',
    'Cycle 5. 6 agents running, 1 crashed mid-review.',
  ],
  'session-complete': [
    'Task: refactor auth. 4 agents, 3 cycles, 18min.',
    'Task: implement search. 8 agents, 5 cycles, 45min.',
    'Task: fix CI pipeline. 1 agent, 1 cycle, 3min.',
    'Task: dependency upgrades. 6 agents, 4 cycles, 35min.',
  ],
  'late-night': [
    '2:30am, 3 sessions active.',
    '4:15am, 1 session active.',
    '1:45am, 2 sessions active.',
    '3:50am, 4 sessions running.',
  ],
  'session-start': [
    'rewrite test suite',
    'add dark mode toggle',
    'migrate database schema',
    'fix flaky integration tests',
  ],
  'agent-crash': [
    'agent-003 (reviewer) crashed. 3/5 agents still running.',
    'agent-001 crashed during linting. 4/6 remain.',
    'agent-007 (implementer) crashed. 1/3 left.',
  ],
  'level-up': [
    'Level 10 (Slope Veteran) → 11 (Hill Philosopher)',
    'Level 14 (Gradient Sage) → 15 (Summit Seeker)',
  ],
  'idle-wake': [
    'Idle for 45 minutes.',
    'Idle for 2 hours.',
    'Idle for 15 minutes.',
  ],
};

// Build a realistic companion state with existing commentary history
// to test anti-repetition
const commentaryHistory: CompanionState['commentaryHistory'] = [];

function makeCompanion(mood: Mood): CompanionState {
  return {
    version: 1,
    name: 'Rocky',
    createdAt: '2026-04-01T00:00:00Z',
    stats: { strength: 60, endurance: 545_000_000, wisdom: 35, patience: 40 },
    xp: 12500,
    level: 11,
    title: 'Hill Veteran',
    mood,
    moodUpdatedAt: new Date().toISOString(),
    achievements: [],
    repos: {},
    lastCommentary: null,
    commentaryHistory,
    sessionsCompleted: 60,
    sessionsCrashed: 5,
    totalActiveMs: 545_000_000,
    lifetimeAgentsSpawned: 380,
    consecutiveCleanSessions: 4,
    consecutiveEfficientSessions: 3,
    consecutiveHighCycleSessions: 0,
    consecutiveDaysActive: 8,
    lastActiveDate: '2026-04-13',
    taskHistory: {},
    dailyRepos: {},
    recentCompletions: [],
    spinnerVerbIndex: 0,
    debugMood: {
      signals: {} as any,
      scores: { happy: 3, grinding: 7, frustrated: 2, zen: 5, sleepy: 1, excited: 2, existential: 4 },
      winner: mood,
    },
  };
}

async function run() {
  console.log(`Generating ${count} commentary samples...\n`);
  console.log('─'.repeat(80));

  for (let i = 0; i < count; i++) {
    const event = eventFilter || EVENTS[i % EVENTS.length];
    const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const contexts = CONTEXTS[event];
    const context = contexts[Math.floor(Math.random() * contexts.length)];
    const companion = makeCompanion(mood);

    const result = await generateCommentary(event, companion, context);

    if (result) {
      // Add to history for anti-repetition testing
      commentaryHistory.push({
        text: result,
        event,
        timestamp: new Date().toISOString(),
      });
      // Keep only last 30
      if (commentaryHistory.length > 30) commentaryHistory.shift();

      const opener = result.split(/\s+/).slice(0, 3).join(' ');
      console.log(`[${i + 1}] ${event} | ${mood} | ${result.length}ch`);
      console.log(`    ${result}`);
      console.log(`    opener: "${opener}"`);
      console.log();
    } else {
      console.log(`[${i + 1}] ${event} | ${mood} | (suppressed by probability)`);
      console.log();
    }
  }

  console.log('─'.repeat(80));

  // Analysis
  const texts = commentaryHistory.map(h => h.text);
  const openers = texts.map(t => t.split(/\s+/)[0]);
  const openerCounts = new Map<string, number>();
  for (const o of openers) openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);

  console.log('\nOpener distribution:');
  for (const [word, ct] of [...openerCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${word}: ${ct}×`);
  }

  const boulderCount = texts.filter(t => /boulder|hill|rock/i.test(t)).length;
  console.log(`\nBoulder/hill/rock mentions: ${boulderCount}/${texts.length} (${Math.round(boulderCount / texts.length * 100)}%)`);

  const iJustCount = texts.filter(t => /^I just/i.test(t)).length;
  console.log(`"I just..." openers: ${iJustCount}/${texts.length}`);
}

run().catch(console.error);
