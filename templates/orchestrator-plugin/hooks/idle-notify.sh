#!/bin/bash
# Stop hook: notify user when orchestrator is idle and tmux window not attended.
# If terminal-notifier is available, clicking the notification switches tmux to
# the orchestrator's window. Falls back to osascript (no click action).
# Always exits 0 with no stdout — never blocks stop.

[ "$SISYPHUS_NOTIFY_ENABLED" = "0" ] && exit 0
[ -z "$TMUX_PANE" ] && exit 0

WINDOW_ACTIVE=$(tmux display-message -t "$TMUX_PANE" -p "#{window_active}" 2>/dev/null)
SESSION_ATTACHED=$(tmux display-message -t "$TMUX_PANE" -p "#{session_attached}" 2>/dev/null)

# User is watching — no notification needed
[ "$WINDOW_ACTIVE" = "1" ] && [ -n "$SESSION_ATTACHED" ] && [ "$SESSION_ATTACHED" != "0" ] && exit 0

SOUND="${SISYPHUS_NOTIFY_SOUND:-/System/Library/Sounds/Hero.aiff}"
LABEL="${SISYPHUS_SESSION_NAME:-orchestrator}"

# Resolve session/window for click-to-switch
SESSION_NAME=$(tmux display-message -t "$TMUX_PANE" -p "#{session_name}" 2>/dev/null)
WINDOW_ID=$(tmux display-message -t "$TMUX_PANE" -p "#{window_index}" 2>/dev/null)

if [ -n "$SESSION_NAME" ] && [ -n "$WINDOW_ID" ] && command -v terminal-notifier &>/dev/null; then
  # Write a one-shot switch script (self-deleting on execution)
  SWITCH_SCRIPT=$(mktemp /tmp/sisyphus-switch.XXXXXX.sh)
  cat > "$SWITCH_SCRIPT" <<EOF
#!/bin/bash
CLIENT=\$(tmux list-clients -F "#{client_activity} #{client_tty}" 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2)
[ -n "\$CLIENT" ] && tmux switch-client -c "\$CLIENT" -t "${SESSION_NAME}:${WINDOW_ID}" 2>/dev/null
tmux select-window -t "${SESSION_NAME}:${WINDOW_ID}" 2>/dev/null
rm -f "\$0"
EOF
  chmod +x "$SWITCH_SCRIPT"

  SOUND_NAME=$(basename "${SOUND}" .aiff)
  (
    terminal-notifier \
      -title "Sisyphus: ${LABEL}" \
      -message "Orchestrator waiting for input" \
      -sound "$SOUND_NAME" \
      -execute "$SWITCH_SCRIPT" 2>/dev/null
  ) &
else
  # Fallback: osascript notification + sound (no click-to-switch)
  (
    osascript -e "display notification \"Orchestrator waiting for input\" with title \"Sisyphus: ${LABEL}\"" 2>/dev/null
    [ -f "$SOUND" ] && afplay "$SOUND" 2>/dev/null
  ) &
fi

exit 0
