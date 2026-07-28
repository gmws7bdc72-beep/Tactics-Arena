#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$PWD/artifacts/fta-game/src" ]; then
  TARGET="$PWD"
elif [ -d "$PWD/src" ] && [ -f "$PWD/package.json" ]; then
  TARGET="$(cd "$PWD/../.." && pwd)"
elif [ -d "$HERE/artifacts/fta-game/src" ]; then
  TARGET="$HERE"
else
  echo "Could not locate artifacts/fta-game. Put this ZIP in your Replit project root and run again."
  exit 1
fi

cp -a "$HERE/artifacts/fta-game/." "$TARGET/artifacts/fta-game/"
echo "Phase 4 installed: expanded 16-player squads and transfer database."
echo "Next: cd artifacts/fta-game && pnpm typecheck && pnpm build"
