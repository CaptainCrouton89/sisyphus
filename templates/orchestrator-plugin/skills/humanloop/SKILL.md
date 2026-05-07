---
name: humanloop
description: >
  Read before calling `sisyphus ask`. Triggers when surfacing multiple questions or decisions to the user, presenting work for review/sign-off, or proposing concrete alternatives. Covers when a deck beats chat, how to design options as real forks the user can pick between, how to bundle related questions into one deck, and how to invoke synchronously so the orchestrator's process blocks until the user answers.
---

# Talking to the user via decks

`sisyphus ask` posts a structured deck of questions to the user's dashboard inbox. They walk through it on their own time and you read structured JSON back. Use it instead of dumping a wall of questions into chat.

This skill covers **what to put in a deck** and **how to invoke it**. Run `sisyphus ask -h` for the CLI shape (file path, `--session`, the `poll` and `peek` subcommands).

## Reach for a deck when

- You have **2+ questions** to surface in one beat (bundle them into one deck).
- You're presenting **work for review or sign-off** (a design, a plan, a completion summary).
- You're choosing between **concrete alternatives** the user must pick.
- The work will sit while the user thinks. Decks survive across cycles; chat does not.

## Skip the deck when

- It's a single, low-stakes question whose answer barely changes downstream work — just ask in chat.
- You can settle the question yourself by reading code or running a tool. **Default to investigating before asking.**
- The user is actively conversing with you — converting a live exchange into a deck adds friction.

## How to invoke

**Run `sisyphus ask` in the foreground — let the Bash tool block.** The CLI waits internally for the user to resolve the deck (potentially 10+ minutes). Your pane stays alive in tmux for the duration; the daemon will not respawn you while a tool call is in flight. When the user answers, the bash returns stdout and you parse it inline.

```bash
result=$(sisyphus ask "$deck")
choice=$(echo "$result" | jq -r '.responses[0].selectedOptionId')
notes=$(echo "$result"  | jq -r '.responses[0].freetext // ""')
```

**Do not `run_in_background` and yield** — yielding kills your pane and any backgrounded bash with it; the next cycle's fresh orchestrator can only peek the on-disk deck (`sisyphus ask peek`) and yield again, producing a polling loop. The daemon now refuses `sisyphus orch yield` while a deck owned by orchestrator is pending; the supported pattern is foreground.

Stdout on completion is one line of JSON: `{responses: [{id, selectedOptionId?, freetext?}, ...], completedAt}`. Branch on each response by its interaction `id`.

If you respawn mid-wait and find a pending deck on disk (e.g. after a daemon restart that orphaned the prior bash), block on it with `sisyphus ask poll <askId>` to re-attach. `sisyphus ask peek <askId>` is non-blocking and reserved for respawn-recovery diagnostics. See `sisyphus ask -h`.

## Designing interactions

### Each option is a concrete path forward

The user picks an option to commit to a direction. Each option should name a real path with its tradeoffs spelled out, grounded in *this* codebase. Sign-off decks branch differently per option ("looks good", "minor fixes", "moderate fixes", "scope rework" each route the orchestrator somewhere different). Decision decks present mutually exclusive directions with named consequences.

<example type="good">
```
title: "Session store backend?"
subtitle: "Auth needs persistent sessions across restarts"
kind: decision
options:
  in-memory:  "In-memory map — simplest. Loses sessions on restart; single-process only."
  redis:      "Redis — survives restart, supports horizontal scale. New ops dependency."
  postgres:   "Reuse existing Postgres — no new infra; ~10ms read latency vs Redis ~1ms."
  defer:      "Ship in-memory now, migrate later if scale becomes real."
allowFreetext: true
freetextLabel: "Different framing — describe it"
```
</example>

<example type="bad">
```
title: "Happy with this design?"
options:
  1. Yes
  2. No, start over
  3. Maybe, with comments
  4. (no option, just freetext)
```
"Happy?" names a feeling, not a fork. Options 3 and 4 both collapse to freetext, forcing the user to invent the actual decision. Rewrite as specific decisions about specific elements of the design.
</example>

### Use `allowFreetext: true` as a safety valve, not the primary input

Freetext catches "anything else?" — opinions or context the options didn't anticipate. When freetext IS the answer you want, write a chat message instead.

<example type="bad">
```
title: "Approve?"
options:
  1. Approve
  2. Reject
  3. Comment
allowFreetext: true
```
A freetext form wearing option clothing. Either name what "reject" actually routes to (back to design? abandon? try a different framing?), or drop the deck and ask in chat.
</example>

### Bound option count to 2–4

Above four, options become too granular for the user to weigh; below two, you've collapsed into a yes/no that's faster to ask in chat.

### Ground options in what you've already gathered

Each option label should reference specifics from the codebase, plan, or exploration you just did — file names, framework constraints, prior decisions. When you can't fill in specifics, investigate before asking.

### One concern per interaction

When two questions interact, give them separate `id` / `title` / `options` inside the same deck (see Bundling below). One interaction asks one thing.

## `kind` — display hint

| kind | use for |
|---|---|
| `decision` | fork in the road; user picks a path forward |
| `validation` | sign-off on completed work |
| `notify` | FYI; user acknowledges |
| `context` | surfacing background that needs a response |
| `error` | something went wrong; user picks a recovery |

The dashboard uses `kind` for inbox icons and sort weight. Mis-tagging trains the user to ignore the icons. Pick the closest fit.

## Bundling

If you'd otherwise submit two decks in the same beat, merge them. One deck with multiple `interactions` is one context switch for the user; two decks is two.

```bash
deck="$SISYPHUS_SESSION_DIR/context/.ask-$(date +%s).json"
cat > "$deck" <<'EOF'
{
  "title": "Phase 2 sign-off + follow-on decisions",
  "interactions": [
    {
      "id": "approve-phase-2",
      "title": "Phase 2 looks good?",
      "kind": "validation",
      "options": [...]
    },
    {
      "id": "phase-3-scope",
      "title": "Phase 3 scope?",
      "kind": "decision",
      "options": [...]
    }
  ]
}
EOF
# Then invoke `sisyphus ask "$deck"` synchronously (foreground bash) — blocks until answered.
# Each interaction returns its own selectedOptionId / freetext in output.responses[], indexed by id.
```

## Submission notes

- The deck is validated at submit (precise errors — trust them).
- `bodyPath` lets an interaction point at a markdown file (e.g. a completion summary) instead of inlining the markdown in JSON.
- On completion, stdout is one line of JSON: `{responses, completedAt}`. Parse `responses[]` and dispatch on each interaction's `id`.
- See `sisyphus ask -h` for the full CLI surface.
