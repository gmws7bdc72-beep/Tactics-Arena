#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="artifacts/fta-game"

if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from the repository root (~/workspace)."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/defensive-curve-dive-$STAMP"

mkdir -p "$BACKUP"
for f in \
  src/engine/ai.ts \
  src/engine/simulation.ts \
  src/engine/types.ts \
  src/pages/Match.tsx \
  src/pages/OnlineMatch.tsx \
  src/components/PitchCanvas.tsx \
  src/components/MechanicPad.tsx
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

node "$SCRIPT_DIR/apply-upgrade.mjs"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $ROOT/$BACKUP"
