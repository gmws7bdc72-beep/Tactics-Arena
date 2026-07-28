#!/usr/bin/env bash
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$PATCH_ROOT/artifacts/fta-game"

if [[ -d "$PWD/artifacts/fta-game/src" ]]; then
  TARGET="$PWD/artifacts/fta-game"
elif [[ -d "$PWD/src" && -f "$PWD/package.json" ]]; then
  TARGET="$PWD"
else
  echo "Could not find Football Tactics Arena."
  echo "Run this from either the main Replit workspace or artifacts/fta-game."
  exit 1
fi

if [[ ! -f "$TARGET/src/game/transferDatabase.ts" ]] ||
  [[ ! -f "$TARGET/src/game/training.ts" ]]; then
  echo "Phase 5 requires the completed Phase 1-4 patches."
  exit 1
fi

SOURCE_REAL="$(cd "$SOURCE" && pwd)"
TARGET_REAL="$(cd "$TARGET" && pwd)"

if [[ "$SOURCE_REAL" != "$TARGET_REAL" ]]; then
  cp -a "$SOURCE/src/." "$TARGET/src/"
else
  echo "Patch files are already in the target project directory."
fi

cat >"$TARGET/PHASE-5-TRANSFER-MARKET-APPLIED.txt" <<'EOF'
Phase 5 transfer market applied.
Season 1 remains scouting-only. Offers, AI transfers and finances unlock in Season 2.
EOF

echo "Phase 5 applied to: $TARGET"
echo "Phase 5 is ready. Replit can now rebuild/restart the app."
echo "Optional check: cd \"$TARGET\" && pnpm typecheck && pnpm build"
