#!/usr/bin/env bash
# Render test-whip-animation.sh frames as a PNG storyboard.
# Requires ImageMagick (`magick`). Each frame becomes a labeled tile.
#
# Usage: bash scripts/whip-image-storyboard.sh [output.png]
# Default output: /tmp/whip-storyboard.png (also `open`ed).

set -euo pipefail

OUT="${1:-/tmp/whip-storyboard.png}"
TMPDIR="$(mktemp -d -t whip-storyboard)"
# Intentionally leave TMPDIR behind so individual frame PNGs can be inspected.
echo "Frames: $TMPDIR"

FONT="/System/Library/Fonts/Menlo.ttc"
WIDTH=32   # popup inner width target
HEIGHT=12

ANIM="$(dirname "$0")/test-whip-animation.sh"

# Override frame() and sleep() so we capture frame content to files.
frame_num=0
last_sleep="?"

frame() {
  frame_num=$((frame_num + 1))
  local f="$TMPDIR/frame-$(printf '%02d' "$frame_num").txt"
  : > "$f"
  local printed=0
  for line in "$@"; do
    # Right-pad to WIDTH so the box is visible.
    local len=${#line}
    if (( len > WIDTH )); then
      # Mark overflow visually but keep the full line (it's still the true frame).
      printf '%s  <-- OVERFLOW(%d)\n' "$line" "$len" >> "$f"
    else
      printf '%-*s\n' "$WIDTH" "$line" >> "$f"
    fi
    printed=$((printed + 1))
  done
  while (( printed < HEIGHT )); do
    printf '%-*s\n' "$WIDTH" "" >> "$f"
    printed=$((printed + 1))
  done
}

sleep() {
  last_sleep="$1"
  # Stamp the sleep into the latest frame file as a trailing label line
  # (after content, so it sits under the frame when rendered).
  local f="$TMPDIR/frame-$(printf '%02d' "$frame_num").txt"
  [ -f "$f" ] && printf '\n-- sleep %.2fs --\n' "$1" >> "$f"
}

# Strip animation plumbing, keep only frame/sleep calls + comments.
awk '
  /^frame\(\) \{/ { inblock=1; next }
  inblock && /^\}/ { inblock=0; next }
  inblock { next }
  /^printf / { next }
  /^trap / { next }
  { print }
' "$ANIM" | source /dev/stdin

# Render each frame to PNG.
for f in "$TMPDIR"/frame-*.txt; do
  num="$(basename "$f" .txt | sed 's/frame-//')"
  png="$TMPDIR/frame-${num}.png"
  magick \
    -background '#111' \
    -fill '#eee' \
    -font "$FONT" \
    -pointsize 22 \
    label:@"$f" \
    -bordercolor '#333' \
    -border 10 \
    "$png"
done

# Compute total duration for the title.
TOTAL=$(python3 - <<PY
import re, pathlib
total = 0.0
for p in sorted(pathlib.Path("$TMPDIR").glob("frame-*.txt")):
    m = re.search(r"-- sleep ([\d.]+)s --", p.read_text())
    if m:
        total += float(m.group(1))
print(f"{total:.2f}")
PY
)

# Montage tiles in rows of 4.
magick montage \
  -tile 4x \
  -geometry +10+10 \
  -background '#000' \
  -fill white \
  -font "$FONT" \
  -pointsize 18 \
  -label 'F%t' \
  "$TMPDIR"/frame-*.png \
  "$TMPDIR/montage.png"

# Add a title bar.
magick "$TMPDIR/montage.png" \
  -background '#000' \
  -fill white \
  -font "$FONT" \
  -pointsize 24 \
  label:"whip-animation storyboard  total=${TOTAL}s  width=$WIDTH" \
  +swap \
  -gravity center \
  -append \
  "$OUT"

echo "Wrote $OUT"
command -v open >/dev/null && open "$OUT"
