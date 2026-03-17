#!/bin/bash
if [ -z "$SISYPHUS_COMPANION_CWD" ]; then exit 0; fi
sisyphus companion-context --cwd "$SISYPHUS_COMPANION_CWD" 2>/dev/null
