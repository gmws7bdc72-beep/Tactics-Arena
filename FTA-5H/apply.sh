#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-5h-$STAMP"

FILES=(
  src/App.tsx
  src/components/PitchCanvas.tsx
  src/engine/ai.ts
  src/engine/grid.ts
  src/engine/simulation.ts
  src/game/persistence.ts
  src/hooks/useGameState.ts
  src/pages/Customize.tsx
  src/pages/Match.tsx
  src/pages/OnlineMatch.tsx
)

if [[ ! -d "$GAME/src" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

for file in "${FILES[@]}"; do
  if [[ ! -f "$GAME/$file" ]]; then
    echo "ERROR: Missing $GAME/$file"
    exit 1
  fi
  if [[ ! -f "$SCRIPT_DIR/files/$file" ]]; then
    echo "ERROR: Patch file missing: $file"
    exit 1
  fi
done

mkdir -p "$BACKUP"
for file in "${FILES[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp "$GAME/$file" "$BACKUP/$file"
done

rollback() {
  echo
  echo "Build failed. Restoring backup..."
  for file in "${FILES[@]}"; do
    cp "$BACKUP/$file" "$GAME/$file"
  done
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

for file in "${FILES[@]}"; do
  cp "$SCRIPT_DIR/files/$file" "$GAME/$file"
done

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
