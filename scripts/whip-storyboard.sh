#!/usr/bin/env bash
# Render every frame from test-whip-animation.sh as a boxed storyboard panel.
# Produces plain-text output so each frame can be inspected statically.

WIDTH=40   # box is wider than the popup to show any overflow clearly
HEIGHT=12

frame_num=0

frame() {
  (( frame_num++ ))
  printf '\n+--- Frame %02d ' "$frame_num"
  local dashes=$((WIDTH - 14))
  printf -- '-%.0s' $(seq 1 $dashes)
  printf '+\n'

  local printed=0
  for line in "$@"; do
    local len=${#line}
    if (( len > WIDTH )); then
      printf '|%s|<--OVERFLOW(%d)\n' "${line:0:$WIDTH}" "$len"
    else
      local pad=$((WIDTH - len))
      printf '|%s%*s|\n' "$line" "$pad" ""
    fi
    (( printed++ ))
  done
  while (( printed < HEIGHT )); do
    printf '|%*s|\n' "$WIDTH" ""
    (( printed++ ))
  done

  printf '+'
  printf -- '-%.0s' $(seq 1 $WIDTH)
  printf '+\n'
}

# No-op the sleep calls and the ANSI preamble/trap from the animation script.
sleep() { :; }

ANIM="$(dirname "$0")/test-whip-animation.sh"

# Strip:
#   - lines starting with `printf ` (the preamble and frame() body)
#   - `trap ...` line
#   - the frame() function definition block (from `frame() {` through matching `}`)
# The remaining content is just the frame-call bodies plus comments.
awk '
  /^frame\(\) \{/ { inblock=1; next }
  inblock && /^\}/ { inblock=0; next }
  inblock { next }
  /^printf / { next }
  /^trap / { next }
  { print }
' "$ANIM" | source /dev/stdin
