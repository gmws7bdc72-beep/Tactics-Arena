#!/usr/bin/env bash
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_GAME="$PATCH_ROOT/artifacts/fta-game"
SOURCE_API="$PATCH_ROOT/artifacts/api-server"

if [[ -d "$PWD/artifacts/fta-game/src" ]]; then
  PROJECT_ROOT="$PWD"
  TARGET_GAME="$PWD/artifacts/fta-game"
elif [[ -d "$PWD/src" && -f "$PWD/package.json" ]]; then
  TARGET_GAME="$PWD"
  PROJECT_ROOT="$(cd "$PWD/../.." && pwd)"
else
  echo "Could not find Football Tactics Arena."
  echo "Run this from either the main Replit workspace or artifacts/fta-game."
  exit 1
fi

if [[ ! -f "$TARGET_GAME/src/game/transferMarket.ts" ]] ||
  ! grep -q "seasonReports" "$TARGET_GAME/src/game/transferMarket.ts"; then
  echo "Phases 7–8 require the completed Phase 6 Management Polish patch."
  exit 1
fi

SOURCE_GAME_REAL="$(cd "$SOURCE_GAME" && pwd)"
TARGET_GAME_REAL="$(cd "$TARGET_GAME" && pwd)"

if [[ "$SOURCE_GAME_REAL" != "$TARGET_GAME_REAL" ]]; then
  cp -a "$SOURCE_GAME/." "$TARGET_GAME/"
else
  echo "Game patch files are already in the target project directory."
fi

TARGET_API="$PROJECT_ROOT/artifacts/api-server"
if [[ -d "$TARGET_API/src/online" ]]; then
  SOURCE_API_REAL="$(cd "$SOURCE_API" && pwd)"
  TARGET_API_REAL="$(cd "$TARGET_API" && pwd)"
  if [[ "$SOURCE_API_REAL" != "$TARGET_API_REAL" ]]; then
    cp -a "$SOURCE_API/." "$TARGET_API/"
  fi
fi

cp -f "$PATCH_ROOT/phase78-curve.test.ts" "$PROJECT_ROOT/phase78-curve.test.ts"

printf '%s\n' \
  "Phases 7–8 mobile controls and curve mechanic applied." \
  "Includes the 2x2 mechanic grid, hold-to-Pass+Move, full-height Curve control, chained paths, and tactical AI curves." \
  >"$TARGET_GAME/PHASE-7-8-MOBILE-CURVE-APPLIED.txt"

echo "Phases 7–8 applied to: $TARGET_GAME"
echo "Replit can now rebuild/restart the app."
echo "Optional check: cd \"$TARGET_GAME\" && pnpm typecheck && pnpm build"

