#!/bin/bash
# Writes Claude session state to /tmp/claude-tmux-state/<pane_id>
# Usage: tmux-state.sh <idle|processing|stopped|cleanup>

pane_id="${TMUX_PANE}"
[ -z "$pane_id" ] && exit 0

STATE_DIR="/tmp/claude-tmux-state"
pane_file="${STATE_DIR}/${pane_id#%}"

case "$1" in
    idle|processing|stopped)
        mkdir -p "$STATE_DIR"
        echo "$1" > "$pane_file"
        ;;
    cleanup)
        rm -f "$pane_file"
        ;;
esac
