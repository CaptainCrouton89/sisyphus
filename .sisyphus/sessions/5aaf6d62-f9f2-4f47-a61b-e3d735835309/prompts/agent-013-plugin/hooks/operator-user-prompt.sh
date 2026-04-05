#!/bin/bash
# UserPromptSubmit hook: reinforce paranoid testing for operator agents.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<operator-reminder>
Click EVERYTHING — assume something is broken and prove it:

- Every link, button, nav item, dropdown, toggle, accordion, interactive element on the page
- Edge cases: empty forms, duplicate submissions, back-button mid-flow, double-clicks, rapid navigation, browser refresh mid-action
- Check ALL sources: DOM, console errors, network failures, logs — not just what's visually obvious
- Spawn subagents to parallelize when scope is broad (one per page/flow/feature area) — the cost of missing a broken button is higher than an extra agent
</operator-reminder>
HINT
