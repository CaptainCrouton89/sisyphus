#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-007' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-007-plugin" --agent 'devcore:programmer' --session-id "7e120a99-c977-499a-af07-91e89c4e011f" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning fix-baseform-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-007-system.md')" 'Fix the dead code in `getBaseForm()` in `src/shared/companion-render.ts` (around line 20-27).

**Bug:** The `<= 19` branch and the fallback `return` both return the identical string `'\''ᕦ(FACE)ᕤ {BOULDER}'\''`. The TITLE_MAP has entries at levels 25 and 30, suggesting a 6th form tier was intended but never implemented.

**Current code:**
```typescript
export function getBaseForm(level: number): string {
  if (level <= 2) return '\''(FACE) {BOULDER}'\'';
  if (level <= 4) return '\''(FACE)/ {BOULDER}'\'';
  if (level <= 7) return '\''/(FACE)/ {BOULDER}'\'';
  if (level <= 11) return '\''\\(FACE)/ {BOULDER}'\'';
  if (level <= 19) return '\''ᕦ(FACE)ᕤ {BOULDER}'\'';
  return '\''ᕦ(FACE)ᕤ {BOULDER}'\'';
}
```

**Fix:** Give level 20+ a distinct form. Use a crowned/ascended variation:
```typescript
export function getBaseForm(level: number): string {
  if (level <= 2) return '\''(FACE) {BOULDER}'\'';
  if (level <= 4) return '\''(FACE)/ {BOULDER}'\'';
  if (level <= 7) return '\''/(FACE)/ {BOULDER}'\'';
  if (level <= 11) return '\''\\(FACE)/ {BOULDER}'\'';
  if (level <= 19) return '\''ᕦ(FACE)ᕤ {BOULDER}'\'';
  return '\''♛ᕦ(FACE)ᕤ {BOULDER}'\'';
}
```

The crown (♛) distinguishes the final tier visually. It'\''s a single Unicode char that renders in all terminal fonts.

Check if there are any tests for `getBaseForm` in `src/__tests__/` — if so, update them. If not, add a small test verifying level 20 returns a string containing '\''♛'\''.

Run `npm test` after to verify.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2484