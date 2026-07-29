#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-artifacts/fta-game}"
if [ ! -d "$ROOT/src" ]; then
  echo "ERROR: run this from the repository root (the folder containing artifacts/fta-game)."
  exit 1
fi
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="backups/mobile-compact-correction-$STAMP"
mkdir -p "$BACKUP/src/components" "$BACKUP/src/hooks"
cp "$ROOT/src/components/PitchCanvas.tsx" "$BACKUP/src/components/"
cp "$ROOT/src/components/MechanicPad.tsx" "$BACKUP/src/components/"
cp "$ROOT/src/hooks/useCurvePlanner.ts" "$BACKUP/src/hooks/"
node "$(dirname "$0")/apply-mobile-compact-correction.mjs" "$ROOT"
echo
echo "Installed successfully. Backup: $BACKUP"
echo "Now run: cd artifacts/fta-game && pnpm typecheck && pnpm build"
