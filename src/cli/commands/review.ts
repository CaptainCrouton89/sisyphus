import type { Command } from 'commander';
import { join, resolve, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync, appendFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { shellQuote } from '../../shared/shell.js';
import { contextDir, historyEventsPath, historySessionDir, sessionsDir } from '../../shared/paths.js';
import { openTmuxWindow, waitForTmuxWindow } from '../../shared/tmux.js';

function resolveContextArtifact(
  file: string | undefined,
  opts: { sessionId?: string; cwd?: string },
  filename: string,
  notFoundMessage: string,
): string {
  const cwd = opts.cwd || process.env.SISYPHUS_CWD || process.cwd();
  if (file) return resolve(file);

  const sessionId = opts.sessionId || process.env.SISYPHUS_SESSION_ID;
  if (sessionId) {
    const target = join(contextDir(cwd, sessionId), filename);
    if (!existsSync(target)) {
      console.error(`Error: File not found: ${target}`);
      process.exit(1);
    }
    return target;
  }

  const dir = sessionsDir(cwd);
  if (existsSync(dir)) {
    const sessions = readdirSync(dir);
    for (const session of sessions.reverse()) {
      const candidate = join(dir, session, 'context', filename);
      if (existsSync(candidate)) return candidate;
    }
  }

  console.error(`Error: ${notFoundMessage}`);
  process.exit(1);
}

export function registerReview(program: Command): void {
  program
    .command('requirements')
    .description('Interactive EARS requirements reviewer — approve, comment on, and refine requirements produced by `sisyphus:spec` (or compatible writers)')
    .argument('[file]', 'Path to requirements.json (auto-detected from session if omitted)')
    .option('--session-id <id>', 'Session ID to find requirements for')
    .option('--cwd <path>', 'Project directory')
    .option('--window', 'Open in a new tmux window instead of inline')
    .option('--wait', 'Block until review completes and print feedback (implies --window)')
    .option('--schema', 'Print the requirements.json schema and exit')
    .option('--annotated', 'Print the schema with writing guidance annotations and exit')
    .option('--export', 'Render requirements.json into requirements.md (no LLM tokens; overwrites existing requirements.md)')
    .option('--force', 'With --export: overwrite existing requirements.md even if hand-edited; existing file is moved to requirements.md.bak before overwrite')
    .addHelpText('after', `
File resolution (first match wins):
  1. Positional [file] argument
  2. --session-id (or SISYPHUS_SESSION_ID env) → .sisyphus/sessions/<id>/context/requirements.json
  3. Most recent session with a requirements.json

Examples:
  $ sisyphus requirements                              Auto-detect from current session
  $ sisyphus requirements path/to/requirements.json    Open a specific file
  $ sisyphus requirements --session-id abc123           Target a specific session
  $ sisyphus requirements --window                     Open in a new tmux window
  $ sisyphus requirements --wait                       Block until review completes (for agent use)
  $ sisyphus requirements --schema                     Print the JSON schema
  $ sisyphus requirements --annotated                  Print schema with writing guidance
  $ sisyphus requirements --export                       Render requirements.md from JSON
  $ sisyphus requirements --export --session-id abc123   Target a specific session
  $ sisyphus requirements --export --force               Overwrite even if hand-edited
`)
    .action(async (file, opts) => {
      if (opts.force && !opts.export) {
        console.error('Error: --force requires --export');
        process.exit(1);
      }
      if (opts.export && opts.schema) {
        console.error('Error: --export cannot be combined with --schema');
        process.exit(1);
      }
      if (opts.export && opts.annotated) {
        console.error('Error: --export cannot be combined with --annotated');
        process.exit(1);
      }
      if (opts.export) {
        const targetPath = resolveContextArtifact(
          file,
          opts,
          'requirements.json',
          'No requirements.json found. Provide a path or use --session-id.',
        );

        if (!existsSync(targetPath)) {
          console.error(`Error: File not found: ${targetPath}`);
          process.exit(1);
        }

        const parsed = JSON.parse(readFileSync(targetPath, 'utf-8')) as Record<string, unknown>;
        const rendered = renderRequirementsMarkdown(parsed);
        const outPath = join(dirname(targetPath), 'requirements.md');
        const tmpPath = outPath + '.tmp';

        if (existsSync(outPath)) {
          const existing = readFileSync(outPath, 'utf-8');
          if (existing !== rendered) {
            if (!opts.force) {
              process.stderr.write(
                `Error: ${outPath} has been hand-edited (differs from rendered output).\n` +
                `Use --force to overwrite (existing file backed up to requirements.md.bak).\n`,
              );
              process.exit(1);
            }
            const bakPath = outPath + '.bak';
            renameSync(outPath, bakPath);
            process.stderr.write(`Note: Existing requirements.md backed up to ${bakPath}\n`);
          }
        }

        writeFileSync(tmpPath, rendered, 'utf-8');
        renameSync(tmpPath, outPath);
        process.stdout.write(resolve(outPath) + '\n');
        return;
      }
      if (opts.schema) {
        process.stdout.write(JSON.stringify(REQUIREMENTS_SCHEMA, null, 2) + '\n');
        return;
      }
      if (opts.annotated) {
        process.stdout.write(REQUIREMENTS_ANNOTATED + '\n');
        return;
      }
      await runReviewTui(file, opts, {
        filename: 'requirements.json',
        binaryName: 'review.js',
        windowName: 'requirements-review',
        feedbackFilename: 'review-feedback.md',
        notFoundMessage: 'No requirements.json found. Provide a path or use --session-id.',
      });
    });

  program
    .command('design')
    .description('Interactive design walkthrough — review architecture decisions, trade-offs, and component designs produced by `sisyphus:spec` (or compatible writers)')
    .argument('[file]', 'Path to design.json (auto-detected from session if omitted)')
    .option('--session-id <id>', 'Session ID to find design for')
    .option('--cwd <path>', 'Project directory')
    .option('--window', 'Open in a new tmux window instead of inline')
    .option('--wait', 'Block until review completes and print feedback (implies --window)')
    .option('--schema', 'Print the design.json schema and exit')
    .option('--annotated', 'Print the schema with writing guidance annotations and exit')
    .addHelpText('after', `
File resolution (first match wins):
  1. Positional [file] argument
  2. --session-id (or SISYPHUS_SESSION_ID env) → .sisyphus/sessions/<id>/context/design.json
  3. Most recent session with a design.json

Examples:
  $ sisyphus design                              Auto-detect from current session
  $ sisyphus design path/to/design.json          Open a specific file
  $ sisyphus design --session-id abc123           Target a specific session
  $ sisyphus design --wait                        Block until review completes (for agent use)
  $ sisyphus design --schema                     Print the JSON schema
  $ sisyphus design --annotated                  Print schema with writing guidance
`)
    .action(async (file, opts) => {
      if (opts.schema) {
        process.stdout.write(JSON.stringify(DESIGN_SCHEMA, null, 2) + '\n');
        return;
      }
      if (opts.annotated) {
        process.stdout.write(DESIGN_ANNOTATED + '\n');
        return;
      }
      await runReviewTui(file, opts, {
        filename: 'design.json',
        binaryName: 'design.js',
        windowName: 'design-walkthrough',
        feedbackFilename: 'design-feedback.md',
        notFoundMessage: 'No design.json found. Provide a path or use --session-id.',
      });
    });
}

interface ReviewTuiConfig {
  filename: string;
  binaryName: string;
  windowName: string;
  feedbackFilename: string;
  notFoundMessage: string;
}

async function runReviewTui(
  file: string | undefined,
  opts: { sessionId?: string; cwd?: string; window?: boolean; wait?: boolean },
  config: ReviewTuiConfig,
): Promise<void> {
  const targetPath = resolveContextArtifact(file, opts, config.filename, config.notFoundMessage);

  if (!existsSync(targetPath)) {
    console.error(`Error: File not found: ${targetPath}`);
    process.exit(1);
  }

  const binaryPath = join(import.meta.dirname, config.binaryName);
  const useWindow = opts.window || opts.wait;

  if (useWindow) {
    const feedbackPath = join(dirname(targetPath), config.feedbackFilename);

    const { windowId, channel } = openTmuxWindow(
      config.windowName,
      `node ${shellQuote(binaryPath)} ${shellQuote(targetPath)}`,
    );

    if (opts.wait) {
      const sessionId = opts.sessionId || process.env.SISYPHUS_SESSION_ID;
      // Emit review-started event before waiting
      if (sessionId) {
        emitReviewEvent(sessionId, 'review-started', {
          type: config.filename === 'requirements.json' ? 'requirements' : 'design',
          filePath: targetPath,
        });
      }

      waitForTmuxWindow(channel);

      if (existsSync(feedbackPath)) {
        process.stdout.write(readFileSync(feedbackPath, 'utf-8'));
        unlinkSync(feedbackPath);
      }

      // Emit review-completed event with timing data from the JSON
      if (sessionId) {
        try {
          const jsonData = JSON.parse(readFileSync(targetPath, 'utf-8'));
          const meta = jsonData.meta;
          const reviewType = config.filename === 'requirements.json' ? 'requirements' : 'design';
          const items = reviewType === 'requirements'
            ? (jsonData.groups ?? []).flatMap((g: { requirements?: unknown[] }) => g.requirements ?? [])
            : (jsonData.sections ?? []).flatMap((s: { items?: unknown[] }) => s.items ?? []);
          const reviewed = items.filter((i: { reviewAction?: string; status?: string }) =>
            i.reviewAction || i.status === 'approved').length;

          emitReviewEvent(sessionId, 'review-completed', {
            type: reviewType,
            filePath: targetPath,
            startedAt: meta?.reviewStartedAt ?? null,
            completedAt: meta?.reviewCompletedAt ?? null,
            durationMs: meta?.reviewStartedAt && meta?.reviewCompletedAt
              ? new Date(meta.reviewCompletedAt).getTime() - new Date(meta.reviewStartedAt).getTime()
              : null,
            itemsReviewed: reviewed,
            itemsTotal: items.length,
          });
        } catch {
          // Best-effort — don't fail the review on history write error
        }
      }
    } else {
      console.log(`Review opened in tmux window ${windowId}`);
    }
  } else {
    execSync(`node ${shellQuote(binaryPath)} ${shellQuote(targetPath)}`, {
      stdio: 'inherit',
    });
  }
}

function emitReviewEvent(sessionId: string, event: 'review-started' | 'review-completed', data: Record<string, unknown>): void {
  try {
    const dir = historySessionDir(sessionId);
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), event, sessionId, data }) + '\n';
    appendFileSync(historyEventsPath(sessionId), line, 'utf-8');
  } catch {
    // Fire-and-forget
  }
}

// ── Requirements schema ──────────────────────────────────────────────

const REQUIREMENTS_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: {
    requirementItem: {
      type: 'object',
      required: ['id', 'title', 'ears', 'criteria', 'status'],
      properties: {
        id: { type: 'string', pattern: '^REQ-\\d{3}$' },
        title: { type: 'string' },
        ears: {
          type: 'object',
          required: ['shall'],
          properties: {
            when: { type: 'string' },
            while: { type: 'string' },
            if: { type: 'string' },
            where: { type: 'string' },
            shall: { type: 'string' },
          },
          oneOf: [
            { required: ['when', 'shall'] },
            { required: ['while', 'shall'] },
            { required: ['if', 'shall'] },
            { required: ['where', 'shall'] },
          ],
        },
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            required: ['text', 'checked'],
            properties: {
              text: { type: 'string' },
              checked: { type: 'boolean' },
            },
          },
        },
        status: { type: 'string', enum: ['draft', 'question', 'approved', 'rejected', 'deferred'] },
        agentNotes: { type: 'string' },
        userNotes: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'question', 'response'],
            properties: {
              id: { type: 'string' },
              question: { type: 'string' },
              response: { type: 'string' },
            },
          },
        },
        reviewAction: { type: ['string', 'null'], enum: ['approve', 'comment', 'bounce-to-design', null] },
        userComment: { type: 'string' },
        startedAt: { type: 'string', format: 'date-time', readOnly: true },
        completedAt: { type: 'string', format: 'date-time', readOnly: true },
      },
    },
  },
  title: 'Sisyphus Requirements',
  description: 'EARS-format behavioral requirements for the sisyphus review TUI',
  type: 'object',
  required: ['meta', 'groups'],
  properties: {
    meta: {
      type: 'object',
      required: ['title', 'summary', 'version', 'lastModified', 'draft'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        summary: { type: 'string' },
        version: { type: 'integer' },
        lastModified: { type: 'string', format: 'date-time' },
        draft: { type: 'integer', minimum: 1 },
        reviewStartedAt: { type: 'string', format: 'date-time', readOnly: true },
        reviewCompletedAt: { type: 'string', format: 'date-time', readOnly: true },
        stage: { type: 'string', enum: ['stage-2-in-progress', 'stage-2-done', 'stage-3-done'] },
        nextSectionId: { type: 'string' },
        bounceIterations: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
      },
    },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'description', 'requirements'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9-]+$' },
          name: { type: 'string' },
          description: { type: 'string' },
          context: { type: 'string' },
          requirements: {
            type: 'array',
            items: { $ref: '#/$defs/requirementItem' },
          },
          safeAssumptions: {
            type: 'array',
            items: { $ref: '#/$defs/requirementItem' },
          },
          openQuestions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'question', 'options', 'response'],
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['title', 'description'],
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                response: { type: 'string' },
                selectedOption: { type: ['integer', 'null'] },
              },
            },
          },
        },
      },
    },
  },
};

const REQUIREMENTS_ANNOTATED = `# requirements.json — Annotated Writing Guide
#
# This is NOT valid JSON — it's a reference showing every field with
# inline guidance. Run \`sisyphus requirements --schema\` for the raw
# JSON Schema.
#
# Safe assumptions are progressively disclosed in the TUI and must satisfy
# the same EARS shape requirements as regular requirements.

{
  "meta": {
    "title": "Feature Name Requirements",
    //        ^ Human-readable title. Shown as the TUI header.

    "subtitle": "EARS Behavioral Spec",
    //           ^ Secondary label. Usually "EARS Behavioral Spec".

    "summary": "2-3 sentences: what is being built, who it's for, and the key constraint.",
    //          ^ Orients the reviewer before they see individual items.
    //            Lead with the user-facing outcome, not the implementation.

    "version": 1,
    //          ^ Always 1. Reserved for future schema versioning.

    "lastModified": "2026-04-04T12:00:00Z",
    //               ^ ISO 8601 timestamp. Update on each save.

    "draft": 1
    //        ^ Increment on each revision cycle (1, 2, 3...).
    //          The TUI shows "Draft N" so the user knows which pass this is.

    // ── TUI-owned fields (do NOT write these) ──
    // "reviewStartedAt": set by TUI when user opens review
    // "reviewCompletedAt": set by TUI when user finishes review

    // ── Spec lead state-machine fields (do NOT write unless you are the spec lead) ──
    // "stage": "stage-2-in-progress" | "stage-2-done" | "stage-3-done" — current spec lead stage
    // "nextSectionId": section ID the lead is about to dispatch the writer for
    // "bounceIterations": Record<sectionId, number> — per-section bounce-loop counter, never decrements
  },

  "groups": [
    // Each group is a thematic area (e.g., "Session Creation", "Error Recovery").
    // Aim for 3-7 groups. Present them in narrative order — the user walks
    // through them sequentially in the TUI.
    {
      "id": "kebab-case-group-id",
      //      ^ Unique, stable across drafts. Use kebab-case.

      "name": "Group Display Name",
      //       ^ Short label shown as the group header in the TUI.

      "description": "What this group covers — one sentence.",
      //              ^ Shown below the group name. Keep it scannable.

      "context": "Rich introduction paragraph for this group.\\n\\nInclude ASCII diagrams:\\n\\n  User ──► Action ──► Response\\n                         │\\n                   ┌─────┴─────┐\\n                   ▼           ▼\\n                Success     Failure",
      //          ^ Displayed before the user reviews individual items.
      //            This is your chance to orient them visually.
      //            Use ASCII diagrams for flows, state transitions, architecture.
      //            Newlines are literal \\n in JSON.

      "requirements": [
        {
          "id": "REQ-001",
          //      ^ Sequential within the file. REQ-001, REQ-002, etc.
          //        Unique across ALL groups, not just this one.

          "title": "Short requirement title",
          //        ^ One line. The user scans these to find items.

          "ears": {
            // ── EARS pattern object ──
            // Exactly ONE condition key + "shall". Never a flat string.
            // The TUI renders the condition and shall as separate colored blocks.
            //
            // Pick the matching pattern:
            //   Event-driven:  { "when": "When [trigger]", "shall": "..." }
            //   State-driven:  { "while": "While [condition]", "shall": "..." }
            //   Unwanted:      { "if": "If [bad condition]", "shall": "..." }
            //   Optional:      { "where": "Where [feature flag]", "shall": "..." }

            "when": "When the user runs \`start\` with a task description",
            //       ^ Start with the EARS keyword: When/While/If/Where.
            //         Describe the trigger or condition, not the implementation.

            "shall": "the system shall create a session and spawn the orchestrator"
            //        ^ Observable behavior. What the user sees or the system does.
            //          Avoid implementation details (no "writes to state.json").
          },

          "criteria": [
            // Acceptance criteria — checkable assertions.
            // The user checks these off during review to confirm agreement.
            {
              "text": "Session ID is returned to the caller",
              //       ^ One testable statement per criterion.
              //         Write it so someone could verify it with a test.

              "checked": false
              //          ^ Always false when you write it. User checks in TUI.
            }
          ],

          "status": "draft",
          //         ^ Your control. Values:
          //           "draft"    — new or revised, needs review
          //           "question" — blocked on user input, won't proceed without answer
          //           "approved" — user approved (set this when reviewAction === "approve")
          //           "rejected" — user rejected
          //           "deferred" — postponed, skip for now
          //
          //         Approved items are SKIPPED in the review TUI on re-entry.

          "agentNotes": "Context for the reviewer — why this requirement exists, caveats, trade-offs.",
          //             ^ Shown in yellow in the TUI. Read-only for the user.
          //               Explain anything non-obvious. Link to code if relevant.

          "userNotes": "",
          //            ^ Leave empty. The user writes back to you here.

          "questions": [
            // Per-requirement questions when you need specific input.
            {
              "id": "q1",
              //      ^ Unique within this requirement.

              "question": "Should this also handle the case where the daemon is offline?",
              //           ^ Focused question. One question per entry.

              "response": ""
              //           ^ Leave empty. User fills it in during review.
            }
          ]

          // ── TUI-owned fields (do NOT write these) ──
          // "reviewAction": "approve" | "comment" | "bounce-to-design" — set by TUI during review
          //   "bounce-to-design" means the user thinks this requirement exposes a flaw in the
          //   underlying design and wants to revisit Stage 1 before continuing.
          // "userComment": free-form comment from user's review session
          // "startedAt": ISO timestamp when user first views this item
          // "completedAt": ISO timestamp when user takes action
        }
      ],

      /*
       * safeAssumptions — items the writer is confident the user will accept without
       * discussion: defaults, conventions, and obviously-correct behaviors that follow
       * directly from the design.
       *
       * NOT safe assumptions: anything novel, anything the writer is uncertain about,
       * or anything that would change with a small design tweak.
       *
       * TUI behavior: collapsed by default in the group-intro phase with a count badge;
       * bulk-approvable in one keystroke, expandable for spot-check.
       *
       * Field shape: identical to a requirements item — same id pattern (REQ-NNN), same
       * ears structure, same criteria, same agentNotes. Cap is 9 per group (matches the
       * TUI's 1-9 number-key affordance). Typical group has 3-7 requirements and 0-9
       * safe assumptions. Use agentNotes to briefly justify why each item qualifies as safe.
       */
      "safeAssumptions": [
        {
          "id": "REQ-010",
          "title": "Default session timeout is 30 minutes",
          "ears": {
            "where": "Where no custom timeout is configured",
            "shall": "the system shall expire idle sessions after 30 minutes"
          },
          "criteria": [
            { "text": "Session expires after 30 minutes of inactivity", "checked": false }
          ],
          "status": "draft",
          "agentNotes": "Safe assumption: 30-minute idle timeout is a near-universal default and the design doc does not specify an alternative.",
          "userNotes": "",
          "questions": []
        }
      ],

      "openQuestions": [
        // Group-level questions — cross-cutting concerns that don't belong
        // to a single requirement. The TUI shows these after the group's items.
        {
          "id": "oq1",
          //      ^ Unique within this group.

          "question": "Should error messages be user-facing or developer-facing?",
          //           ^ The question you're asking.

          "options": [
            // Pre-filled answer choices. Include 2-3 options.
            // The TUI automatically adds a "Custom answer" option.
            {
              "title": "User-facing",
              //        ^ Short label for this choice.

              "description": "Plain language, no stack traces. Better UX but harder to debug."
              //              ^ Your reasoning for why this option makes sense.
            },
            {
              "title": "Developer-facing",
              "description": "Include error codes and context. Better for debugging, worse for non-technical users."
            }
          ],

          "response": "",
          //           ^ Leave empty. User fills in or picks an option.

          "selectedOption": null
          //                 ^ Set by TUI to the option title the user picked.
          //                   null if they wrote a custom response instead.
        }
      ]
    }
  ]
}`;

// ── Design schema ────────────────────────────────────────────────────

const DESIGN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Sisyphus Design',
  description: 'Technical design document for the sisyphus design review TUI',
  type: 'object',
  required: ['meta', 'sections'],
  properties: {
    meta: {
      type: 'object',
      required: ['title', 'subtitle', 'summary', 'version', 'lastModified', 'draft'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        summary: { type: 'string' },
        version: { type: 'integer' },
        lastModified: { type: 'string', format: 'date-time' },
        draft: { type: 'integer', minimum: 1 },
        reviewStartedAt: { type: 'string', format: 'date-time', readOnly: true },
        reviewCompletedAt: { type: 'string', format: 'date-time', readOnly: true },
      },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'goal', 'items'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9-]+$' },
          name: { type: 'string' },
          goal: { type: 'string' },
          context: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title', 'description', 'content', 'status'],
              properties: {
                id: { type: 'string', pattern: '^DES-\\d{3}$' },
                title: { type: 'string' },
                description: { type: 'string' },
                content: { type: 'string' },
                decision: {
                  type: 'object',
                  properties: {
                    proposal: {
                      type: 'object',
                      required: ['title', 'description'],
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                      },
                    },
                    alternatives: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['title', 'description'],
                        properties: {
                          title: { type: 'string' },
                          description: { type: 'string' },
                        },
                      },
                    },
                    lenses: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                    },
                  },
                },
                agentNotes: { type: 'string' },
                status: { type: 'string', enum: ['draft', 'approved', 'rejected', 'deferred'] },
                userNotes: { type: 'string' },
                reviewAction: { type: ['string', 'null'], enum: ['agree', 'pick-alt', 'comment', null] },
                selectedAlternative: { type: ['string', 'null'] },
                userComment: { type: 'string' },
                startedAt: { type: 'string', format: 'date-time', readOnly: true },
                completedAt: { type: 'string', format: 'date-time', readOnly: true },
              },
            },
          },
          openQuestions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'question', 'options', 'response'],
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['title', 'description'],
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                response: { type: 'string' },
                selectedOption: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
};

const DESIGN_ANNOTATED = `# design.json — Annotated Writing Guide
#
# This is NOT valid JSON — it's a reference showing every field with
# inline guidance. Run \`sisyphus design --schema\` for the raw
# JSON Schema.

{
  "meta": {
    "title": "Feature Name Design",
    //        ^ Human-readable title. Shown as the TUI header.

    "subtitle": "Technical Architecture",
    //           ^ Secondary label. Usually "Technical Architecture".

    "summary": "2-3 sentences: what we're designing and the key constraint driving the approach.",
    //          ^ Orients the reviewer. Lead with the design challenge, not the solution.

    "version": 1,
    "lastModified": "2026-04-04T12:00:00Z",
    "draft": 1
    //        ^ Same semantics as requirements — increment on each revision cycle.

    // ── TUI-owned (do NOT write) ──
    // "reviewStartedAt", "reviewCompletedAt"
  },

  "sections": [
    // Each section is a narrative chapter of the design (e.g., "Data Model",
    // "API Surface", "State Management"). Ordered for reading, not by importance.
    {
      "id": "kebab-case-section-id",
      "name": "Section Display Name",

      "goal": "What the user should understand after this section",
      //       ^ Shown at the section header. Frame as an outcome:
      //         "After this section you'll know how state flows between components."

      "context": "Rich presentation content — diagrams, narrative.\\n\\n  Client ──► API ──► DB\\n                      │\\n                ┌─────┴─────┐\\n                ▼           ▼\\n             Cache       Events",
      //          ^ The main orienting visual for this section.
      //            ASCII diagrams showing architecture, data flow, or component relationships.
      //            Displayed before the user reviews individual design items.

      "items": [
        {
          "id": "DES-001",
          //      ^ Sequential across ALL sections. DES-001, DES-002, etc.

          "title": "Short design point title",
          //        ^ Scannable. The user sees these in a list.

          "description": "What this design point covers — one sentence.",
          //              ^ Shown as subtitle. Brief context.

          "content": "Detailed design content.\\n\\nInclude interface sketches, schema outlines, diagrams:\\n\\n  interface SessionState {\\n    id: string;\\n    status: 'active' | 'paused';\\n  }\\n\\nExplain the rationale alongside the structure.",
          //          ^ The main body. This IS the design presentation.
          //            Use code blocks, diagrams, tables — whatever communicates.

          "decision": {
            // ── OPTIONAL — only include when there's a genuine trade-off ──
            // If there's only one reasonable approach, skip this field entirely.

            "proposal": {
              "title": "Recommended approach",
              //        ^ Short name for the recommended option.

              "description": "What it is, why it's recommended, and key trade-offs."
              //              ^ The case for this approach. Be honest about downsides.
            },

            "alternatives": [
              // Other options you considered. 1-3 alternatives.
              {
                "title": "Alternative name",
                "description": "What it is and why it wasn't chosen."
                //              ^ Explain the reasoning, not just "we didn't pick this."
              }
            ],

            "lenses": {
              // Named evaluation dimensions. Each lens gets a short assessment.
              // Pick dimensions relevant to THIS decision (not a fixed set).
              "complexity": "Simple — single file change, atomic operation",
              "durability": "Moderate — survives restart but not crash during write",
              "performance": "Fine at current scale, may need caching at 10x"
              //              ^ Honest, specific assessments. Not just "good/bad".
            }
          },

          "agentNotes": "Architect's sidebar — why this matters, what's non-obvious.",
          //             ^ Read-only in TUI (yellow text). Your reasoning for the reviewer.

          "status": "draft",
          //         ^ "draft" for new items. Set to "approved" when reviewAction is "agree".

          "userNotes": "",
          //            ^ Leave empty. User writes back here.

          "reviewAction": null,
          //               ^ Leave null. TUI sets to:
          //                 "agree"    — user accepted your proposal
          //                 "pick-alt" — user chose an alternative (check selectedAlternative)
          //                 "comment"  — user left feedback without deciding

          "userComment": ""
          //              ^ Leave empty. Free-form comment from user's review.

          // ── TUI-owned (do NOT write) ──
          // "selectedAlternative": title of the alternative the user picked (with "pick-alt")
          // "startedAt", "completedAt"
        }
      ],

      "openQuestions": [
        // Same structure as requirements — per-section cross-cutting questions.
        {
          "id": "oq1",
          "question": "Should we optimize for read performance or write simplicity?",
          "options": [
            { "title": "Read-optimized", "description": "Denormalize, add caching. Faster reads, harder writes." },
            { "title": "Write-simple", "description": "Normalized, no cache. Simpler code, slower reads." }
          ],
          "response": "",
          "selectedOption": null
        }
      ]
    }
  ]
}`;

// ── Requirements markdown renderer ───────────────────────────────────

function renderRequirementItem(out: string[], req: Record<string, unknown>): void {
  const item: string[] = [];

  item.push(`### ${req.id}: ${req.title}`);
  item.push('');
  item.push(`**Status:** ${req.status}`);
  item.push('');

  const ears = req.ears as Record<string, string>;
  const earsClauses: string[] = [];
  if (ears.when) earsClauses.push(ears.when);
  if (ears.while) earsClauses.push(ears.while);
  if (ears.if) earsClauses.push(ears.if);
  if (ears.where) earsClauses.push(ears.where);
  earsClauses.push(ears.shall);
  item.push(earsClauses.join(', '));
  item.push('');

  const criteria = req.criteria as Array<{ text: string; checked: boolean }> | undefined;
  if (criteria && criteria.length > 0) {
    item.push('**Acceptance Criteria:**');
    item.push('');
    for (const c of criteria) {
      item.push(`- [${c.checked ? 'x' : ' '}] ${c.text}`);
    }
    item.push('');
  }

  const agentNotes = req.agentNotes ? String(req.agentNotes).trim() : '';
  if (agentNotes) {
    item.push('**Agent Notes:**');
    item.push('');
    item.push(agentNotes);
    item.push('');
  }

  const userNotes = req.userNotes ? String(req.userNotes).trim() : '';
  if (userNotes) {
    item.push('**User Notes:**');
    item.push('');
    item.push(userNotes);
    item.push('');
  }

  const questions = req.questions as Array<{ id: string; question: string; response: string }> | undefined;
  if (questions && questions.length > 0) {
    item.push('**Questions:**');
    item.push('');
    for (const q of questions) {
      item.push(`- **${q.id}:** ${q.question}`);
      const resp = q.response.trim();
      item.push(`  **Response:** ${resp !== '' ? resp : '(unanswered)'}`);
    }
    item.push('');
  }

  const userComment = req.userComment ? String(req.userComment).trim() : '';
  if (userComment) {
    item.push('**User Comment:**');
    item.push('');
    item.push(userComment);
    item.push('');
  }

  while (item.length > 0 && item[item.length - 1] === '') item.pop();
  out.push(...item);
}

function renderRequirementsMarkdown(json: Record<string, unknown>): string {
  const meta = json.meta as Record<string, unknown>;
  const groups = json.groups as Array<Record<string, unknown>>;
  const out: string[] = [];

  out.push(`# ${meta.title}`);
  out.push('');
  if (meta.subtitle) {
    out.push(`*${meta.subtitle}*`);
    out.push('');
  }
  out.push(`Draft ${meta.draft} — ${meta.lastModified}`);
  out.push('');
  out.push('---');
  out.push('');
  if (meta.summary) {
    out.push(String(meta.summary));
    out.push('');
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];

    if (gi > 0) {
      out.push('');
      out.push('');
    }

    out.push(`## ${group.name}`);
    out.push('');

    if (group.description) {
      out.push(String(group.description));
      out.push('');
    }

    if (group.context) {
      out.push(String(group.context));
      out.push('');
    }

    const requirements = group.requirements as Array<Record<string, unknown>>;
    for (let ri = 0; ri < requirements.length; ri++) {
      if (ri > 0) out.push('');
      renderRequirementItem(out, requirements[ri]);
    }

    const safeAssumptions = group.safeAssumptions as Array<Record<string, unknown>> | undefined;
    if (safeAssumptions && safeAssumptions.length > 0) {
      out.push('');
      out.push('### Safe Assumptions');
      out.push('');
      for (let si = 0; si < safeAssumptions.length; si++) {
        if (si > 0) out.push('');
        renderRequirementItem(out, safeAssumptions[si]);
      }
    }

    const openQuestions = group.openQuestions as Array<Record<string, unknown>> | undefined;
    if (openQuestions && openQuestions.length > 0) {
      out.push('');
      out.push('### Open Questions');
      out.push('');
      for (const oq of openQuestions) {
        out.push(`**${oq.id}:** ${oq.question}`);
        out.push('');
        const options = oq.options as Array<Record<string, unknown>> | undefined;
        if (options && options.length > 0) {
          for (const opt of options) {
            out.push(`- **${opt.title}:** ${opt.description}`);
          }
          out.push('');
        }
        const resp = typeof oq.response === 'string' ? oq.response.trim() : '';
        out.push(`**Response:** ${resp !== '' ? resp : '(unanswered)'}`);
        out.push('');
      }
    }
  }

  return out.join('\n') + '\n';
}
