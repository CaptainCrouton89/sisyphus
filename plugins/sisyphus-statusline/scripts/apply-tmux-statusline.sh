#!/usr/bin/env bash
set -euo pipefail

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

window_tab_bg='#2d2f33'
window_tab_active_bg='#4a4d55'
status_left_bg='#1d1e21'
active_text='#e2d9c6'
inactive_text='#b0a898'

window_status_format="#[fg=${inactive_text}]#[bg=${window_tab_bg}] #W#(~/.tmux/claude-status.sh '#{window_id}')#{@sisyphus_dots} #{?window_end_flag,#[fg=${window_tab_bg}]#[bg=${status_left_bg}],#{?#{e|==:#{active_window_index},#{e|+|:#{window_index},1}},#[fg=${window_tab_bg}]#[bg=${window_tab_active_bg}],#[fg=${window_tab_bg}]#[bg=${window_tab_bg}]}}"
window_status_current_format="#[fg=${active_text}]#[bg=${window_tab_active_bg}]#[bold] #W#(~/.tmux/claude-status.sh '#{window_id}')#{@sisyphus_dots} #[nobold]#[fg=${window_tab_active_bg}]#[bg=#{?window_end_flag,${status_left_bg},${window_tab_bg}}]"

tmux set-option -g window-status-separator ''
tmux set-option -g window-status-format "$window_status_format"
tmux set-option -g window-status-current-format "$window_status_current_format"

current_status_right="$(tmux show-option -gv status-right 2>/dev/null || true)"
if [[ -n "$current_status_right" && "$current_status_right" != *'@sisyphus_status'* ]]; then
  updated="${current_status_right/#\#\[fg=/#\{E:@sisyphus_status\}\#\[fg=}"
  if [[ "$updated" == "$current_status_right" ]]; then
    updated="#{E:@sisyphus_status}${current_status_right}"
  fi
  tmux set-option -g status-right "$updated"
fi

tmux set-option -g status-right-length 250
tmux set-option -g @sisyphus_status ''

echo "Applied Sisyphus tmux statusline options."
