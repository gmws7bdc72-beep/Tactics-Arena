#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$PWD/artifacts/fta-game/src" ]; then DEST="$PWD"
elif [ -d "$PWD/src" ] && [ -f "$PWD/package.json" ]; then DEST="$(cd ../.. && pwd)"
else echo "Run this from your Replit workspace root or artifacts/fta-game."; exit 1; fi
cp -f "$HERE/artifacts/fta-game/src/engine/types.ts" "$DEST/artifacts/fta-game/src/engine/types.ts"
cp -f "$HERE/artifacts/fta-game/src/game/transferDatabase.ts" "$DEST/artifacts/fta-game/src/game/transferDatabase.ts"
echo "Phase 4 repair applied. Squads now vary from 11 to 15 players, with a max of 16."
