#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-gameplay-tweaks-$STAMP"

if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Could not find $GAME/src"
  echo "Run this from the Replit workspace or pass the workspace path as the first argument."
  exit 1
fi

mkdir -p "$BACKUP"
for rel in \
  src/engine/types.ts \
  src/engine/simulation.ts \
  src/engine/ai.ts \
  src/components/PitchCanvas.tsx \
  src/game/transferMarket.ts \
  src/hooks/useGameState.ts
do
  mkdir -p "$BACKUP/$(dirname "$rel")"
  cp "$GAME/$rel" "$BACKUP/$rel"
done

rollback() {
  echo
  echo "Build failed. Restoring the previous working files..."
  cp -R "$BACKUP/." "$GAME/"
  echo "Rollback complete. Backup preserved at: $BACKUP"
}
trap rollback ERR

cp -R "$SCRIPT_DIR/files/." "$GAME/"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS: gameplay tweaks installed and build passed."
echo "Backup: $BACKUP"
