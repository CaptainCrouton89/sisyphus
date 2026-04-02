#!/bin/bash
# Integration test harness for sisyphus.
# Run from project root: bash test/integration/run.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

# ---------------------------------------------------------------------------
# Cleanup trap — set up early so partial runs still clean up
# ---------------------------------------------------------------------------

TARBALL=""
STAGE_DIR=""
RESULTS_DIR=""

cleanup() {
  [ -n "$TARBALL" ] && rm -f "$TARBALL"
  [ -n "$STAGE_DIR" ] && rm -rf "$STAGE_DIR"
  [ -n "$RESULTS_DIR" ] && rm -rf "$RESULTS_DIR"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 1: Pack project into tarball
# ---------------------------------------------------------------------------

echo "==> Packing project..."
TARBALL=$(npm pack 2>/dev/null | tail -1)
echo "    tarball: $TARBALL"

# ---------------------------------------------------------------------------
# Step 2: Stage Docker build context
# Avoids sending node_modules/.git/src as context (~500MB → ~5MB)
# ---------------------------------------------------------------------------

echo "==> Staging Docker context..."
STAGE_DIR=$(mktemp -d)
RESULTS_DIR=$(mktemp -d)

cp "$TARBALL" "$STAGE_DIR/"
cp "$SCRIPT_DIR/Dockerfile" "$STAGE_DIR/"
cp -r "$SCRIPT_DIR/lib" "$STAGE_DIR/lib"
cp -r "$SCRIPT_DIR/suites" "$STAGE_DIR/suites"

# ---------------------------------------------------------------------------
# Step 3: Build all three Docker targets (sequential — shared layer cache)
# ---------------------------------------------------------------------------

echo "==> Building Docker images..."
for target in base tmux full; do
  echo "    building target: $target"
  docker build --target "$target" -t "sisyphus-test:$target" "$STAGE_DIR" \
    --quiet 2>&1 | tail -1
done

# ---------------------------------------------------------------------------
# Step 4: Run tests per tier, capture structured output
# ---------------------------------------------------------------------------

echo "==> Running test tiers..."
OVERALL_EXIT=0

for tier in base tmux full; do
  echo "--- tier: $tier ---"
  if docker run --rm "sisyphus-test:$tier" bash "/tests/suites/test-${tier}.sh" \
      > "$RESULTS_DIR/${tier}.txt" 2>&1; then
    echo "    ✓ $tier: all passed"
  else
    echo "    ✗ $tier: failures detected"
    OVERALL_EXIT=1
  fi
done

# ---------------------------------------------------------------------------
# Step 5: Print per-tier summaries
# ---------------------------------------------------------------------------

echo ""
echo "=== Per-tier summaries ==="
for tier in base tmux full; do
  result_file="$RESULTS_DIR/${tier}.txt"
  echo ""
  echo "--- $tier ---"
  if [ -f "$result_file" ]; then
    # Print any FAIL/SKIP lines for context, then the summary line
    grep -E '^(FAIL\||SKIP\|)' "$result_file" || true
    grep '^TOTAL:' "$result_file" || echo "(no summary line)"
  else
    echo "(no output captured)"
  fi
done

# ---------------------------------------------------------------------------
# Step 6: Print consolidated matrix
# ---------------------------------------------------------------------------

print_matrix() {
  # Collect all unique test names from all tiers (in order of appearance)
  local all_names=()
  local seen=()

  for tier in base tmux full; do
    local result_file="$RESULTS_DIR/${tier}.txt"
    [ -f "$result_file" ] || continue
    while IFS='|' read -r status name rest; do
      # Only parse result lines before the --- separator
      [[ "$status" == "---" ]] && break
      [[ "$status" =~ ^(PASS|FAIL|SKIP)$ ]] || continue
      # Deduplicate
      local found=0
      for existing in "${seen[@]+"${seen[@]}"}"; do
        [ "$existing" = "$name" ] && found=1 && break
      done
      if [ "$found" -eq 0 ]; then
        all_names+=("$name")
        seen+=("$name")
      fi
    done < "$result_file"
  done

  if [ "${#all_names[@]}" -eq 0 ]; then
    echo "(no test results to display)"
    return
  fi

  # Determine column width for test name (minimum 24)
  local name_width=24
  for name in "${all_names[@]}"; do
    local len="${#name}"
    [ "$len" -gt "$name_width" ] && name_width="$len"
  done
  name_width=$(( name_width + 2 ))

  # Helper: look up status of a test name in a tier's result file
  get_status() {
    local tier="$1"
    local test_name="$2"
    local result_file="$RESULTS_DIR/${tier}.txt"
    if [ ! -f "$result_file" ]; then
      echo "----"
      return
    fi

    while IFS='|' read -r status name rest; do
      [ "$status" = "---" ] && break
      [[ "$status" =~ ^(PASS|FAIL|SKIP)$ ]] || continue
      if [ "$name" = "$test_name" ]; then
        echo "$status"
        return
      fi
    done < "$result_file"
    echo "----"
  }

  # Header
  printf "%-${name_width}s  %-6s  %-6s  %-6s\n" "Test" "base" "tmux" "full"
  printf '%0.s─' $(seq 1 $(( name_width + 26 )))
  echo ""

  # Rows
  for name in "${all_names[@]}"; do
    local base_status tmux_status full_status
    base_status=$(get_status base "$name")
    tmux_status=$(get_status tmux "$name")
    full_status=$(get_status full "$name")
    printf "%-${name_width}s  %-6s  %-6s  %-6s\n" \
      "$name" "$base_status" "$tmux_status" "$full_status"
  done

  # Per-tier totals
  echo ""
  printf "%-${name_width}s  " "TOTALS"
  for tier in base tmux full; do
    local summary
    summary=$(grep '^TOTAL:' "$RESULTS_DIR/${tier}.txt" 2>/dev/null || echo "TOTAL: ? | PASS: ? | FAIL: ? | SKIP: ?")
    local pass fail
    pass=$(echo "$summary" | sed -n 's/.*PASS: \([0-9][0-9]*\).*/\1/p')
    fail=$(echo "$summary" | sed -n 's/.*FAIL: \([0-9][0-9]*\).*/\1/p')
    [ -z "$pass" ] && pass="?"
    [ -z "$fail" ] && fail="?"
    printf "P:%-3s F:%-2s  " "$pass" "$fail"
  done
  echo ""
}

echo ""
echo "=== Test Matrix ==="
print_matrix

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
if [ "$OVERALL_EXIT" -eq 0 ]; then
  echo "✓ All tiers passed."
else
  echo "✗ One or more tiers failed."
fi

exit "$OVERALL_EXIT"
