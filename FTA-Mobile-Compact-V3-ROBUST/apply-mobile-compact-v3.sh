#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
GAME="artifacts/fta-game"
for f in \
  "$GAME/src/components/PitchCanvas.tsx" \
  "$GAME/src/components/MechanicPad.tsx" \
  "$GAME/src/hooks/useCurvePlanner.ts"; do
  [[ -f "$f" ]] || { echo "ERROR: missing $f" >&2; exit 1; }
done
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="backups/mobile-compact-v3-$STAMP"
mkdir -p "$BACKUP/src/components" "$BACKUP/src/hooks"
cp "$GAME/src/components/PitchCanvas.tsx" "$BACKUP/src/components/"
cp "$GAME/src/components/MechanicPad.tsx" "$BACKUP/src/components/"
cp "$GAME/src/hooks/useCurvePlanner.ts" "$BACKUP/src/hooks/"
node "$(dirname "$0")/apply-mobile-compact-v3.mjs"
echo
echo "SUCCESS: Mobile compact V3 applied."
echo "Backup: $BACKUP"
