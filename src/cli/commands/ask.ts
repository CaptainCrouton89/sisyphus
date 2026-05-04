import type { Command } from 'commander';
import { existsSync, readFileSync, watchFile, unwatchFile } from 'node:fs';
import { resolve } from 'node:path';
import { ulid } from 'ulid';
import { parseDeck } from '../../shared/ask-schema.js';
import { createAsk, readMeta, updateMeta, writeDecisions } from '../../daemon/ask-store.js';
import { emitHistoryEvent } from '../../daemon/history.js';
import { askOutputPath, statePath } from '../../shared/paths.js';
import * as state from '../../daemon/state.js';
import { ORCHESTRATOR_ASKED_BY } from '../../shared/types.js';
import type { AskOutput, AskStatus } from '../../shared/types.js';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function validateAskId(askId: string): void {
  if (!ULID_RE.test(askId)) {
    console.error(`Error: invalid askId format: ${askId}`);
    process.exit(1);
  }
}

export function registerAsk(program: Command): void {
  const ask = program
    .command('ask')
    .description('Submit a structured question deck for the user to answer (blocks until answered)')
    .argument('[file]', 'Path to deck JSON (omit for poll/peek subcommands)')
    .option('--session <id>', 'Session id (defaults to SISYPHUS_SESSION_ID)')
    .addHelpText('after', `
Posts a deck of questions to the user's dashboard inbox. They walk through it and you read the structured JSON back from stdout.

The CLI always blocks until the user answers (which can take 10+ minutes). Invoke through the Bash tool with \`run_in_background: true\` so your shell isn't tied up; you'll be notified automatically when the command completes, with the output ready to parse. Same pattern for orchestrators, sub-agents, and one-off Claude Code sessions.

For guidance on when to use a deck, how to design options the user can actually choose between, and how to bundle related questions into one deck, read the \`humanloop\` skill before authoring.

Deck JSON: an object with \`interactions: [{ id, title, options, kind?, allowFreetext?, body? | bodyPath?, ... }]\`. Validation errors at submit are precise — trust them.
`)
    .action(async (file: string | undefined, opts: { session?: string }) => {
      if (!file) {
        ask.help();
        return;
      }
      await submit(file, opts);
    });

  ask
    .command('poll <askId>')
    .description('Block until <askId> is answered, then print output JSON')
    .option('--session <id>', 'Session id (defaults to SISYPHUS_SESSION_ID)')
    .action(async (askId: string, opts: { session?: string }) => poll(askId, opts));

  ask
    .command('peek <askId>')
    .description('Print {askId, status, completedAt?, output?} for <askId> without blocking')
    .option('--session <id>', 'Session id (defaults to SISYPHUS_SESSION_ID)')
    .action(async (askId: string, opts: { session?: string }) => peek(askId, opts));
}

function mintAskId(): string {
  return ulid();
}

function resolveClaudeSessionId(cwd: string, sessionId: string, askedBy: string): string | undefined {
  if (!existsSync(statePath(cwd, sessionId))) return undefined;
  const session = state.getSession(cwd, sessionId);
  if (askedBy === ORCHESTRATOR_ASKED_BY) {
    const last = session.orchestratorCycles[session.orchestratorCycles.length - 1];
    return last?.claudeSessionId;
  }
  return session.agents.find(a => a.id === askedBy)?.claudeSessionId;
}

function resolveSessionEnv(opts: { session?: string }): { cwd: string; sessionId: string } {
  const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
  const cwd = process.env.SISYPHUS_CWD ?? process.cwd();
  if (!sessionId) {
    console.error('Error: provide --session or set SISYPHUS_SESSION_ID');
    process.exit(1);
  }
  return { cwd, sessionId };
}

/**
 * Idempotently mark an ask answered: stamp meta.completedAt, emit `ask-answered`,
 * and credit `userBlockedMs` on the session/cycle if the ask was blocking.
 * Re-entrant: the `meta.completedAt` check ensures only the first observer credits the wait.
 */
async function markAnswered(cwd: string, sessionId: string, askId: string): Promise<void> {
  const meta = readMeta(cwd, sessionId, askId);
  if (!meta || meta.completedAt) return;

  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(meta.askedAt).getTime();

  try {
    await updateMeta(cwd, sessionId, askId, { status: 'answered', completedAt });
  } catch {
    // updateMeta throws if the meta file vanished mid-flight; treat as best-effort.
    return;
  }

  emitHistoryEvent(sessionId, 'ask-answered', {
    askId,
    askedBy: meta.askedBy,
    blocking: meta.blocking,
    durationMs,
    askedAt: meta.askedAt,
    completedAt,
  });

  if (meta.blocking && durationMs > 0) {
    try {
      if (existsSync(statePath(cwd, sessionId))) {
        await state.incrementUserBlockedMs(cwd, sessionId, durationMs, meta.askedAt, meta.askedBy);
      }
    } catch {
      // State increment is best-effort — history event is the source of truth for autopsy.
    }
  }
}

function waitForOutput(cwd: string, sessionId: string, askId: string, initialPpid?: number): Promise<AskOutput> {
  const outputPath = askOutputPath(cwd, sessionId, askId);

  if (existsSync(outputPath)) {
    return Promise.resolve(JSON.parse(readFileSync(outputPath, 'utf-8')) as AskOutput);
  }

  return new Promise((res, _rej) => {
    let ppidWatcher: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      unwatchFile(outputPath, onChange);
      if (ppidWatcher !== undefined) clearInterval(ppidWatcher);
      process.removeListener('SIGINT', onSigint);
    };

    const onChange = () => {
      if (!existsSync(outputPath)) return;
      try {
        const out = JSON.parse(readFileSync(outputPath, 'utf-8')) as AskOutput;
        cleanup();
        res(out);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || err instanceof SyntaxError) {
          // File disappeared mid-read or atomic rename not yet complete — next tick will retry
          return;
        }
        throw err;
      }
    };
    watchFile(outputPath, { interval: 250 }, onChange);

    if (initialPpid !== undefined && initialPpid !== 1) {
      ppidWatcher = setInterval(() => {
        if (process.ppid !== initialPpid || process.ppid === 1) {
          cleanup();
          process.exit(0);
        }
      }, 250);
    }

    const onSigint = () => {
      cleanup();
      process.exit(130);
    };
    process.once('SIGINT', onSigint);
  });
}

async function submit(file: string, opts: { session?: string }): Promise<void> {
  const { cwd, sessionId } = resolveSessionEnv(opts);
  const askedBy = process.env.SISYPHUS_AGENT_ID ?? ORCHESTRATOR_ASKED_BY;

  const deckPath = resolve(file);
  if (!existsSync(deckPath)) {
    console.error(`Error: deck file not found: ${deckPath}`);
    process.exit(1);
  }

  let decisions;
  try {
    decisions = parseDeck(deckPath);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const initialPpid = process.ppid;
  const claudeSessionId = resolveClaudeSessionId(cwd, sessionId, askedBy);
  const askId = mintAskId();

  const q0 = decisions.interactions[0];
  createAsk(cwd, sessionId, {
    askId,
    askedBy,
    blocking: true,
    pid: process.pid,
    claudeSessionId,
    cwd,
    title: decisions.title !== undefined ? decisions.title : q0?.title,
    subtitle: q0?.subtitle,
    kind: q0?.kind,
  });
  writeDecisions(cwd, sessionId, askId, decisions);

  const output = await waitForOutput(cwd, sessionId, askId, initialPpid);
  await markAnswered(cwd, sessionId, askId);
  process.stdout.write(JSON.stringify(output) + '\n');
}

async function poll(askId: string, opts: { session?: string }): Promise<void> {
  validateAskId(askId);
  const { cwd, sessionId } = resolveSessionEnv(opts);
  const meta = readMeta(cwd, sessionId, askId);
  if (!meta) {
    console.error(`Error: askId not found: ${askId}`);
    process.exit(1);
  }
  const output = await waitForOutput(cwd, sessionId, askId);
  await markAnswered(cwd, sessionId, askId);
  process.stdout.write(JSON.stringify(output) + '\n');
}

async function peek(askId: string, opts: { session?: string }): Promise<void> {
  validateAskId(askId);
  const { cwd, sessionId } = resolveSessionEnv(opts);
  const meta = readMeta(cwd, sessionId, askId);
  if (!meta) {
    process.stdout.write(JSON.stringify({ askId, status: 'not-found' satisfies AskStatus }) + '\n');
    return;
  }
  const outputPath = askOutputPath(cwd, sessionId, askId);
  const result: { askId: string; status: AskStatus; completedAt?: string; output?: AskOutput } = {
    askId,
    status: meta.status,
  };
  if (meta.completedAt) result.completedAt = meta.completedAt;
  try {
    if (existsSync(outputPath)) {
      result.output = JSON.parse(readFileSync(outputPath, 'utf-8')) as AskOutput;
    }
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    // output.json mid-write (atomic rename in progress); leave output key absent
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}
