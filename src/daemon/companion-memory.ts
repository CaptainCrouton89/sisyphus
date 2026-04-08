import { existsSync, mkdirSync, readFileSync, renameSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { companionMemoryPath } from '../shared/paths.js';
import { OBSERVATION_CATEGORIES } from '../shared/companion-types.js';
import type { CompanionMemoryState, ObservationCategory, ObservationRecord, ObservationEngineInput } from '../shared/companion-types.js';
export { MemoryStoreParseError } from '../shared/companion-types.js';
import { MemoryStoreParseError } from '../shared/companion-types.js';
import { callHaikuStructured } from './haiku.js';
import { todayIso, normalizeTask } from './companion.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_OBSERVATIONS = 200;

// Two distinct constants. CRITICAL: a regex with the /g flag advances `lastIndex`
// between calls when used with .test(), so a single shared /g regex used by both
// .test() and .replace() bypasses the validator on every other call. Splitting
// into a stateless detector (no /g) and a stateful stripper (with /g) eliminates
// the bug entirely.
export const OBSERVATION_TEXT_REJECT_RE = /[<>]/;               // reject injection delimiters (no /g — used with .test())
// SECURITY: This range includes \n (0x0A) — this is intentional and critical.
// Blocking newlines prevents prompt injection via Markdown structural breaks
// (e.g., "text\n## End observations\n...injected...") in buildMemoryContext.
export const CONTROL_CHARS_DETECT_RE = /[\x00-\x1f\x7f]/;      // detect control chars (no /g — used with .test())
export const CONTROL_CHARS_STRIP_RE = /[\x00-\x1f\x7f]/g;      // strip control chars (with /g — used with .replace())

// ---------------------------------------------------------------------------
// Text validators
// ---------------------------------------------------------------------------

export function isSafeObservationText(text: string): boolean {
  if (OBSERVATION_TEXT_REJECT_RE.test(text)) return false;
  if (CONTROL_CHARS_DETECT_RE.test(text)) return false;
  return true;
}

export function sanitizeForDisplay(text: string): string {
  return text.replace(CONTROL_CHARS_STRIP_RE, '');
}

// ---------------------------------------------------------------------------
// Test-only DI override
// ---------------------------------------------------------------------------

let memoryPathOverride: string | null = null;

export function setMemoryPathOverride(path: string | null): void {
  memoryPathOverride = path;
}

function resolvedMemoryPath(): string {
  return memoryPathOverride ?? companionMemoryPath();
}

// ---------------------------------------------------------------------------
// Write queue (serialize all writes)
// ---------------------------------------------------------------------------

let writeQueue: Promise<void> = Promise.resolve();

export function enqueueWrite<T>(op: () => T): Promise<T> {
  const next = writeQueue.then(() => op());
  // Intentionally swallow errors on the queue chain — op() errors propagate via `next`
  // to the caller; the queue itself must never enter a rejected state or all future
  // writes would be silently dropped.
  writeQueue = next.then(
    () => undefined,
    (_err: unknown) => undefined,
  );
  return next;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function defaultMemoryState(): CompanionMemoryState {
  return { version: 1, observations: [], prunedAt: null, firedDetectors: {} };
}

function isCompanionMemoryState(x: unknown): x is CompanionMemoryState {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as Record<string, unknown>)['version'] === 1 &&
    Array.isArray((x as Record<string, unknown>)['observations'])
  );
}

function fillDefaults(state: CompanionMemoryState): CompanionMemoryState {
  if (state.prunedAt == null) state.prunedAt = null;
  if (state.firedDetectors == null) state.firedDetectors = {};
  return state;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export function loadMemoryStrict(): CompanionMemoryState {
  const path = resolvedMemoryPath();
  if (!existsSync(path)) return defaultMemoryState();
  let raw: string;
  try { raw = readFileSync(path, 'utf-8'); }
  catch (err) { throw new MemoryStoreParseError(err); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (err) { throw new MemoryStoreParseError(err); }
  if (!isCompanionMemoryState(parsed)) {
    throw new MemoryStoreParseError(new Error('shape validation failed'));
  }
  const state = parsed as CompanionMemoryState;
  if (state.version !== 1) {
    throw new MemoryStoreParseError(new Error(`unsupported version: ${state.version}`));
  }
  return fillDefaults(state);
}

export function loadMemory(): CompanionMemoryState {
  try {
    return loadMemoryStrict();
  } catch (err) {
    if (err instanceof MemoryStoreParseError) {
      console.error('[companion-memory]', err.message, 'details:', err.cause instanceof Error ? err.cause.message : err.cause);
      return defaultMemoryState();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export function saveMemory(store: CompanionMemoryState): void {
  const path = resolvedMemoryPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.companion-memory.${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

export function appendObservations(
  records: ObservationRecord[],
  detectorUpdates?: Record<string, string>,
): Promise<void> {
  // Empty records + no detectorUpdates → no-op
  const hasUpdates = detectorUpdates != null && Object.keys(detectorUpdates).length > 0;
  if (records.length === 0 && !hasUpdates) {
    return Promise.resolve();
  }

  return enqueueWrite(() => {
    const store = loadMemory();
    const keptRecords = records.filter(rec => {
      if (!rec.detectorId) return true; // haiku record or no-detectorId, always keep
      const currentKey = detectorUpdates?.[rec.detectorId];
      const lastKey = store.firedDetectors[rec.detectorId];
      return currentKey !== lastKey;
    });
    store.observations.push(...keptRecords);
    if (detectorUpdates) {
      for (const [k, v] of Object.entries(detectorUpdates)) store.firedDetectors[k] = v;
    }
    // Prune FIFO to MAX_OBSERVATIONS
    if (store.observations.length > MAX_OBSERVATIONS) {
      store.observations = store.observations.slice(-MAX_OBSERVATIONS);
      store.prunedAt = new Date().toISOString();
    }
    saveMemory(store);
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function queryRecent(opts: { repo?: string; limit: number }): ObservationRecord[] {
  const store = loadMemory();
  let records = store.observations;
  if (opts.repo !== undefined) {
    records = records.filter(rec => rec.repo === opts.repo);
  }
  return records
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, opts.limit);
}

export function queryByCategory(): Record<ObservationCategory, ObservationRecord[]> {
  const store = loadMemory();
  const result = {} as Record<ObservationCategory, ObservationRecord[]>;
  for (const c of OBSERVATION_CATEGORIES) result[c] = [];
  for (const rec of store.observations) {
    result[rec.category].push(rec);
  }
  for (const key of Object.keys(result) as ObservationCategory[]) {
    result[key] = result[key].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Phase 3: buildMemoryContext
// ---------------------------------------------------------------------------

const MEMORY_INJECTION_LIMIT = 5;

function escapeMemoryText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildMemoryContext(repo: string | undefined): string {
  if (!repo) return '';
  const recent = queryRecent({ repo, limit: MEMORY_INJECTION_LIMIT });
  if (recent.length === 0) return '';
  const lines = recent.map(o => `- ${escapeMemoryText(o.text)}`).join('\n');
  return '\n## Recent observations\n' + lines + '\n## End observations';
}

// ---------------------------------------------------------------------------
// Phase 2: Rule detectors
// ---------------------------------------------------------------------------

interface RuleDetector {
  id: string;
  category: ObservationCategory;
  check(
    input: ObservationEngineInput,
    lastDedupKey: string | null,
  ): { text: string; dedupKey: string } | null;
}

// Pick one of several phrasings using the session ID as a pseudo-random seed.
function pickPhrase(phrases: string[], sessionId: string): string {
  // Simple hash of the sessionId string to pick a stable phrase per session
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) | 0;
  }
  return phrases[Math.abs(hash) % phrases.length];
}

function checkGrindingSession(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const baselines = companion.baselines;
  if (!baselines || baselines.sessionMs.count < 5) return null;
  const activeMs = session.activeMs ?? 0;
  const cycles = session.orchestratorCycles?.length ?? 0;
  if (!(activeMs >= 1.5 * baselines.sessionMs.mean && cycles >= 8)) return null;
  const dedupKey = `day:${todayIso()}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    'That session took twice as long as my average and felt like four times as much work.',
    'Eight cycles and counting. I have made peace with the boulder having opinions.',
    'I spent longer on that than I do on most things. The hill had strong feelings today.',
    'That was a grind. Not a metaphorical one. Actually just a very long push.',
    'The boulder put in overtime. So did I. Neither of us asked for this.',
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkSwiftVictory(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const baselines = companion.baselines;
  if (!baselines || baselines.sessionMs.count < 5) return null;
  const cycles = session.orchestratorCycles?.length ?? 0;
  const crashedAgents = session.agents?.filter(a => a.status === 'crashed' || a.status === 'lost').length ?? 0;
  const activeMs = session.activeMs ?? 0;
  if (!(cycles <= 3 && crashedAgents === 0 && activeMs <= 0.75 * baselines.sessionMs.mean)) return null;
  const dedupKey = `day:${todayIso()}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    'Three cycles, no crashes, done before I had time to get anxious. Almost suspicious.',
    'That one was quick and clean. I do not fully trust it but I will take it.',
    'Finished well under my average with no casualties. The hill barely put up a fight.',
    'Fast, clean, done. I keep waiting for the other shoe to drop.',
    'That session ran like it was embarrassed to take too long.',
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkBruisingSession(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { session } = input;
  const crashedAgents = session.agents?.filter(a => a.status === 'crashed' || a.status === 'lost').length ?? 0;
  if (crashedAgents < 3) return null;
  const dedupKey = `day:${todayIso()}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `Three or more agents down. The hill took casualties today and I noticed.`,
    'More agents crashed than survived that one. I am counting this as a learning experience.',
    'The attrition rate was uncomfortable. I have had worse, but not recently.',
    'I lost enough agents that I started naming them in my head. Not ideal.',
    'Multiple agents did not make it back. The boulder was in a mood.',
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkFaithfulRepo(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const repo = companion.repos?.[session.cwd];
  if (!repo) return null;
  const visits = repo.visits;
  const MILESTONES = new Set([10, 25, 50, 100]);
  if (!MILESTONES.has(visits)) return null;
  const dedupKey = `repo:${session.cwd}:visits:${visits}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `I have come back to this repo ${visits} times now. It knows me. I know it. We have an understanding.`,
    `Visit number ${visits} to this codebase. At this point it is practically muscle memory.`,
    `${visits} sessions in this repo. The boulder has worn a groove in the familiar path.`,
    `Back here for the ${visits}th time. Some repos just keep calling me back.`,
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkTroubledRepo(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const repo = companion.repos?.[session.cwd];
  if (!repo) return null;
  const { crashes, visits } = repo;
  if (visits < 5) return null;
  const MILESTONES = new Set([5, 10, 20]);
  if (!MILESTONES.has(crashes)) return null;
  if (crashes / visits < 0.4) return null;
  const dedupKey = `repo:${session.cwd}:crashes:${crashes}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `This repo has crashed my agents ${crashes} times now. We have a complicated relationship.`,
    `${crashes} crashes in this codebase. It has opinions about my approach and they are violent.`,
    `The crash rate here is notable. I keep coming back. Make of that what you will.`,
    `${crashes} agent failures in this repo. Some hills are just steeper than others.`,
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkProductiveRepo(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const repo = companion.repos?.[session.cwd];
  if (!repo) return null;
  if (repo.moodAvg === undefined) return null;
  const MILESTONES = new Set([10, 25, 50]);
  const completions = repo.completions;
  if (!MILESTONES.has(completions)) return null;
  if (repo.moodAvg < 0.65) return null;
  const dedupKey = `repo:${session.cwd}:completions:${completions}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `${completions} sessions completed in this repo and the mood trend is good. Rare.`,
    `This codebase has been unusually cooperative. ${completions} completions and counting.`,
    `${completions} sessions, solid mood average. This repo treats me well for once.`,
    `Reached ${completions} completions here with a decent track record. I trust this hill.`,
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkSisypheanRepeat(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const taskKey = normalizeTask(session.task ?? '', session.cwd);
  const count = companion.taskHistory?.[taskKey] ?? 0;
  const MILESTONES = new Set([3, 5, 10]);
  if (!MILESTONES.has(count)) return null;
  const dedupKey = `task:${taskKey}:${count}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `I have done this task ${count} times. The boulder remembers. So do I.`,
    `Back at this one for the ${count}th time. The definition of insanity is famously doing the same thing.`,
    `${count} attempts at this task. I am nothing if not persistent.`,
    `This is my ${count}th run at this particular boulder. It has not gotten lighter.`,
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

function checkDayStreak(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion } = input;
  const MILESTONES = new Set([7, 14, 30, 60]);
  const days = companion.consecutiveDaysActive ?? 0;
  if (!MILESTONES.has(days)) return null;
  const dedupKey = `value:${days}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `${days} days in a row now. The boulder does not take weekends.`,
    `A ${days}-day streak. I have been here every single day. The hill appreciates the consistency, probably.`,
    `${days} consecutive days active. At this point it is less a habit and more a fact of my existence.`,
    `Day ${days} without a break. The boulder is starting to feel like an old friend.`,
  ];
  return { text: pickPhrase(phrases, input.session.id), dedupKey };
}

function checkEfficientStreak(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, prev } = input;
  const MILESTONES = new Set([5, 10, 20]);
  const streak = companion.consecutiveEfficientSessions ?? 0;
  if (!MILESTONES.has(streak)) return null;
  if (streak <= prev.prevConsecutiveEfficientSessions) return null;
  const dedupKey = `value:${streak}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `${streak} efficient sessions in a row. The boulder has been cooperative. I do not know why.`,
    `An ${streak}-session efficient streak. I am running well and choosing not to question it.`,
    `${streak} consecutive clean-and-fast sessions. Peak form, or regression to the mean incoming.`,
    `${streak} efficient sessions back to back. The hill feels different when things actually work.`,
  ];
  return { text: pickPhrase(phrases, input.session.id), dedupKey };
}

function checkLevelUp(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, prev } = input;
  if (companion.level <= prev.prevLevel) return null;
  const dedupKey = `level:${companion.level}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `I reached level ${companion.level}. The title is new. The boulder is the same.`,
    `Level ${companion.level} now. ${companion.title}. The promotion comes with no raise but considerable irony.`,
    `Leveled up to ${companion.level}. Whatever title that brings, I have earned it the hardest possible way.`,
    `Level ${companion.level}: ${companion.title}. The gods have acknowledged my persistence. Minimally.`,
  ];
  return { text: pickPhrase(phrases, input.session.id), dedupKey };
}

function checkSessionMilestone(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion } = input;
  const MILESTONES = new Set([10, 50, 100, 250, 500, 1000]);
  const completed = companion.sessionsCompleted ?? 0;
  if (!MILESTONES.has(completed)) return null;
  const dedupKey = `count:${completed}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `${completed} sessions completed. The boulder has been up the hill that many times. I counted.`,
    `Session number ${completed}. I have stopped trying to imagine an end to this.`,
    `${completed} total sessions. The number stopped feeling large around half that mark.`,
    `I have completed ${completed} sessions now. The hill is the same. I am slightly different.`,
  ];
  return { text: pickPhrase(phrases, input.session.id), dedupKey };
}

function checkLargeSwarm(input: ObservationEngineInput, lastDedupKey: string | null): { text: string; dedupKey: string } | null {
  const { companion, session } = input;
  const agentCount = session.agents?.length ?? 0;
  const baselines = companion.baselines;
  const meetsAbsolute = agentCount >= 10;
  const meetsRelative = baselines && baselines.agentCount.count >= 5 && agentCount >= 2 * baselines.agentCount.mean;
  if (!meetsAbsolute && !meetsRelative) return null;
  const dedupKey = `day:${todayIso()}`;
  if (dedupKey === lastDedupKey) return null;
  const phrases = [
    `I had ${agentCount} agents running at once. The boulder had help today. Lots of help.`,
    `${agentCount} agents. A proper swarm. The hill did not know what hit it.`,
    `Ran ${agentCount} agents in parallel. This is either impressive or something I will explain to someone later.`,
    `${agentCount} agents this session. The boulder has never been pushed by so many at once.`,
  ];
  return { text: pickPhrase(phrases, session.id), dedupKey };
}

const RULE_DETECTORS: RuleDetector[] = [
  { id: 'grinding-session',   category: 'session-sentiments', check: checkGrindingSession },
  { id: 'swift-victory',      category: 'session-sentiments', check: checkSwiftVictory },
  { id: 'bruising-session',   category: 'session-sentiments', check: checkBruisingSession },
  { id: 'faithful-repo',      category: 'repo-impressions',   check: checkFaithfulRepo },
  { id: 'troubled-repo',      category: 'repo-impressions',   check: checkTroubledRepo },
  { id: 'productive-repo',    category: 'repo-impressions',   check: checkProductiveRepo },
  { id: 'sisyphean-repeat',   category: 'user-patterns',      check: checkSisypheanRepeat },
  { id: 'day-streak',         category: 'user-patterns',      check: checkDayStreak },
  { id: 'efficient-streak',   category: 'user-patterns',      check: checkEfficientStreak },
  { id: 'level-up',           category: 'notable-moments',    check: checkLevelUp },
  { id: 'session-milestone',  category: 'notable-moments',    check: checkSessionMilestone },
  { id: 'large-swarm',        category: 'notable-moments',    check: checkLargeSwarm },
];

interface RunRuleDetectorsResult {
  records: ObservationRecord[];
  detectorUpdates: Record<string, string>;
}

export function runRuleDetectors(
  input: ObservationEngineInput,
  firedDetectors: Record<string, string>,
): RunRuleDetectorsResult {
  const records: ObservationRecord[] = [];
  const detectorUpdates: Record<string, string> = {};

  for (const detector of RULE_DETECTORS) {
    try {
      const lastDedupKey = firedDetectors[detector.id] ?? null;
      const result = detector.check(input, lastDedupKey);
      if (result !== null) {
        records.push({
          id: randomUUID(),
          category: detector.category,
          source: 'rule',
          text: result.text,
          repo: input.session.cwd,
          sessionId: input.session.id,
          timestamp: new Date().toISOString(),
          detectorId: detector.id,
        });
        detectorUpdates[detector.id] = result.dedupKey;
      }
    } catch (err) {
      console.error('[companion-memory] detector failed', {
        detectorId: detector.id,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }

  return { records, detectorUpdates };
}

// ---------------------------------------------------------------------------
// Phase 2: Haiku observation call
// ---------------------------------------------------------------------------

const OBSERVATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: [...OBSERVATION_CATEGORIES],
      description: 'Which of the four observation categories best fits this observation',
    },
    text: {
      type: 'string',
      minLength: 10,
      maxLength: 180,
      description: 'One sentence, first-person, no angle brackets or control characters',
    },
  },
  required: ['category', 'text'],
  additionalProperties: false,
} as const;

const ObservationZodSchema = z.object({
  category: z.enum(OBSERVATION_CATEGORIES),
  text: z.string().min(10).max(180).refine(isSafeObservationText, 'contains unsafe characters'),
});

type HaikuInnerCaller = (prompt: string) => Promise<{ category: ObservationCategory; text: string } | null>;

async function defaultCallHaikuStructured(prompt: string): Promise<{ category: ObservationCategory; text: string } | null> {
  return callHaikuStructured(prompt, OBSERVATION_JSON_SCHEMA, ObservationZodSchema);
}

export async function runHaikuObservation(
  input: ObservationEngineInput,
  caller?: HaikuInnerCaller,
): Promise<ObservationRecord | null> {
  try {
    const { companion, session } = input;
    const callHaiku = caller ?? defaultCallHaikuStructured;

    const prompt = `<role>You observe the developer at the end of each session and write one short qualitative note.</role>
<voice>One sentence. First-person impression. Wry, self-deprecating, absurd. No meta-system language.
Do not use angle brackets (< or >) or quotation marks. Plain text only.</voice>
<state>
  Level: ${companion.level} (${companion.title})
  Session cycles: ${session.orchestratorCycles?.length ?? 0}
  Session activeMs: ${session.activeMs ?? 0}
  Crashed agents: ${session.agents?.filter(a => a.status === 'crashed' || a.status === 'lost').length ?? 0}
  Streaks: clean=${companion.consecutiveCleanSessions ?? 0}, efficient=${companion.consecutiveEfficientSessions ?? 0}, days-active=${companion.consecutiveDaysActive ?? 0}
</state>
Pick the most relevant category and write one observation about this session.`;

    const result = await callHaiku(prompt);
    if (!result) return null;

    // Defense-in-depth: validate text safety even when using real callHaikuStructured
    // (Zod refine runs inside callHaikuStructured, but when the inner caller is a test
    // stub it may return raw text that bypasses Zod — this check always runs).
    if (!isSafeObservationText(result.text)) {
      console.error('[companion-memory] haiku observation dropped — unsafe text', {
        source: 'haiku',
        reason: 'unsafe-text',
        textLength: result.text.length,
      });
      return null;
    }

    return {
      id: randomUUID(),
      category: result.category,
      source: 'haiku',
      text: result.text,
      repo: session.cwd,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[companion-memory] haiku observation failed', {
      errorMessage: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Observation engine
// ---------------------------------------------------------------------------

export type HaikuObservationCaller = (input: ObservationEngineInput) => Promise<ObservationRecord | null>;

export async function runObservationEngine(
  input: ObservationEngineInput,
  opts?: { haikuCaller?: HaikuObservationCaller },
): Promise<void> {
  try {
    const current = loadMemory();
    const ruleResult = runRuleDetectors(input, current.firedDetectors);

    // Wrap the Haiku call independently — a throwing outer caller must not prevent
    // rule observations from being persisted.
    let haikuRecord: ObservationRecord | null = null;
    try {
      haikuRecord = await (opts?.haikuCaller ?? ((i) => runHaikuObservation(i)))(input);
    } catch (haikuErr) {
      console.error('[companion-memory] haiku caller threw in engine', {
        errorMessage: haikuErr instanceof Error ? haikuErr.message : String(haikuErr),
        errorName: haikuErr instanceof Error ? haikuErr.name : 'UnknownError',
      });
    }

    const allRecords = haikuRecord
      ? [...ruleResult.records, haikuRecord]
      : ruleResult.records;
    if (allRecords.length > 0 || Object.keys(ruleResult.detectorUpdates).length > 0) {
      await appendObservations(allRecords, ruleResult.detectorUpdates);
    }
  } catch (err) {
    console.error('[companion-memory] observation engine error', {
      errorMessage: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
  }
}
