#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${FTA_ROOT:-$HOME/workspace/artifacts/fta-game}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$ROOT/backups/fta-a14f-$STAMP"

FILES=(
  "src/engine/types.ts"
  "src/game/players.ts"
  "src/engine/constants.ts"
  "src/engine/grid.ts"
  "src/components/PitchCanvas.tsx"
  "src/game/training.ts"
  "src/game/transferDatabase.ts"
  "src/game/transferMarket.ts"
  "src/engine/simulation.ts"
  "src/engine/ai.ts"
  "src/pages/TeamSetup.tsx"
)

if [[ ! -d "$ROOT/src" || ! -f "$ROOT/package.json" ]]; then
  echo "Could not find the FTA project at: $ROOT"
  echo "Set FTA_ROOT to the project directory and run this installer again."
  exit 1
fi

for file in "${FILES[@]}"; do
  if [[ ! -f "$ROOT/$file" ]]; then
    echo "Expected project file is missing: $ROOT/$file"
    exit 1
  fi
  if [[ ! -f "$PATCH_DIR/files/$file" ]]; then
    echo "Patch file is missing: $PATCH_DIR/files/$file"
    exit 1
  fi
done

for file in "${FILES[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$file")"
  cp "$ROOT/$file" "$BACKUP_DIR/$file"
done

rollback() {
  local status=$?
  echo
  echo "Checks failed. Restoring the previous FTA files..."
  for file in "${FILES[@]}"; do
    cp "$BACKUP_DIR/$file" "$ROOT/$file"
  done
  echo "Rollback complete. Backup: $BACKUP_DIR"
  exit "$status"
}
trap rollback ERR

for file in "${FILES[@]}"; do
  cp "$PATCH_DIR/files/$file" "$ROOT/$file"
done

cd "$ROOT"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "FTA-A14F installed successfully."
echo "Backup: $BACKUP_DIR"
echo "Existing squads are repaired on load; ability development starts on the next training week."
