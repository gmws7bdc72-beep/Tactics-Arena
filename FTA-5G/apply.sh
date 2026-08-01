#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-5g-$STAMP"
mkdir -p "$BACKUP/src/engine"
cp "$GAME/src/engine/simulation.ts" "$BACKUP/src/engine/simulation.ts"
cp "$GAME/src/engine/constants.ts" "$BACKUP/src/engine/constants.ts"

rollback() {
  echo
  echo "Build failed. Restoring backup..."
  cp "$BACKUP/src/engine/simulation.ts" "$GAME/src/engine/simulation.ts"
  cp "$BACKUP/src/engine/constants.ts" "$GAME/src/engine/constants.ts"
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

node "$HERE/apply.mjs"
cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
