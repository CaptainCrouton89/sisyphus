#!/bin/sh
# Claude Code wrapper for integration tests.
# Delegates plugin/marketplace commands to the real Claude Code binary.
# All other invocations sleep (simulating a long-running Claude session).

case "$1" in
  plugin|plugins)
    exec claude-real "$@"
    ;;
  *)
    exec sleep 300
    ;;
esac
