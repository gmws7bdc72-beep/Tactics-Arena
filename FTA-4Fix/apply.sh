#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run from ~/workspace."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-4fix-$STAMP"

mkdir -p "$BACKUP"
for f in \
  src/pages/Customize.tsx \
  src/pages/TransferMarket.tsx \
  src/pages/Match.tsx \
  src/pages/OnlineMatch.tsx \
  src/engine/simulation.ts \
  src/components/PitchCanvas.tsx \
  src/hooks/useCurvePlanner.ts
do
  mkdir -p "$BACKUP/$(dirname "$f")"
  cp "$GAME/$f" "$BACKUP/$f"
done

rollback() {
  echo
  echo "Build failed. Restoring backup..."
  cp -R "$BACKUP"/. "$GAME"/
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

node "$SCRIPT_DIR/apply.mjs"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
