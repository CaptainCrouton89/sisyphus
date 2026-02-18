#!/bin/bash
cat <<'EOF'
{"decision":"block","reason":"Before stopping, consider: use `sisyphus yield` to end this cycle and let the daemon respawn you with updated state, or use AskUserQuestion if you need clarification from the user."}
EOF
