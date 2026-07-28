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

if [[ ! -f "$TARGET/src/game/transferMarket.ts" ]] ||
  [[ ! -f "$TARGET/src/pages/TransferMarket.tsx" ]] ||
  ! grep -q "processTransferWeek" "$TARGET/src/game/transferMarket.ts" ||
  ! grep -q "Incoming offers" "$TARGET/src/pages/TransferMarket.tsx"; then
  echo "Phase 6 requires the completed Phase 5 AI Transfer Market patch."
  exit 1
fi

SOURCE_REAL="$(cd "$SOURCE" && pwd)"
TARGET_REAL="$(cd "$TARGET" && pwd)"

if [[ "$SOURCE_REAL" != "$TARGET_REAL" ]]; then
  cp -a "$SOURCE/src/." "$TARGET/src/"
else
  echo "Patch files are already in the target project directory."
fi

cat >"$TARGET/PHASE-6-MANAGEMENT-POLISH-APPLIED.txt" <<'EOF'
Phase 6 management polish applied.
Includes quick offer notifications, transfer/finance polish, club and player histories, and season reports.
EOF

echo "Phase 6 applied to: $TARGET"
echo "Phase 6 is ready. Replit can now rebuild/restart the app."
echo "Optional check: cd \"$TARGET\" && pnpm typecheck && pnpm build"
