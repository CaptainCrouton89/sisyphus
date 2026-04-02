#!/usr/bin/env bash
set -euo pipefail

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$CURRENT_DIR/scripts/apply-tmux-statusline.sh"
