#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-iq-$STAMP"
MANIFEST="$BACKUP/manifest.txt"
mkdir -p "$BACKUP"
: > "$MANIFEST"

FILES=(
  "src/App.tsx"
  "src/components/PitchCanvas.tsx"
  "src/engine/simulation.ts"
  "src/engine/types.ts"
  "src/game/abilityLimits.ts"
  "src/game/matchStats.ts"
  "src/game/persistence.ts"
  "src/game/predictionMemory.ts"
  "src/pages/Match.tsx"
  "src/pages/PostMatch.tsx"
  "src/pages/TeamSetup.tsx"
)

for rel in "${FILES[@]}"; do
  if [ -f "$GAME/$rel" ]; then
    echo "existing|$rel" >> "$MANIFEST"
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp "$GAME/$rel" "$BACKUP/$rel"
  else
    echo "new|$rel" >> "$MANIFEST"
  fi
done

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Install failed. Restoring previous files..."
  while IFS='|' read -r kind rel; do
    [ -n "$rel" ] || continue
    if [ "$kind" = "existing" ]; then
      mkdir -p "$GAME/$(dirname "$rel")"
      cp "$BACKUP/$rel" "$GAME/$rel"
    else
      rm -f "$GAME/$rel"
    fi
  done < "$MANIFEST"
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

for rel in "${FILES[@]}"; do
  mkdir -p "$GAME/$(dirname "$rel")"
  cp "$SCRIPT_DIR/files/$rel" "$GAME/$rel"
done

echo "Files installed. Running checks..."
cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
