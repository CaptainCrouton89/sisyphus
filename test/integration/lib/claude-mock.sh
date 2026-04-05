#!/bin/sh
# Claude Code wrapper for integration tests.
# Delegates plugin/marketplace commands to the real Claude Code binary.
# All other invocations sleep (simulating a long-running Claude session).

REAL_CLAUDE="/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js"

case "$1" in
  plugin|plugins)
    exec node "$REAL_CLAUDE" "$@"
    ;;
  *)
    exec sleep 300
    ;;
esac
