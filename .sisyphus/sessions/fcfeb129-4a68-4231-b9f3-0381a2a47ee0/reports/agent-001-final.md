Plan written to context/plan-present.md. Key decisions:

1. src/cli/commands/present.ts (new) — registerPresent() exporting pattern matching review.ts
2. src/cli/index.ts — add import + registerPresent(program) after registerReview

Tmux blocking pattern mirrors review.ts exactly: channel=present-{hex}, nvim tempfile; tmux wait-for -S channel; exit.

Diff algorithm: LCS on ANSI-stripped lines. Any edited line not matched to original → tagged 'user'. Contiguous user blocks wrapped in <!-- user: --> / <!-- /user -->. Handles insertions AND modifications (modified lines are unmatched in LCS → tagged user).

Edge cases covered: termrender ENOENT, user quits without save (no annotations), empty file, not-in-tmux, temp file cleanup via try/finally.

All dependencies are stdlib + shared/shell.js (already in codebase).