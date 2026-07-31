#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-5f-$STAMP"

if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

FILES=(
  src/pages/Customize.tsx
  src/hooks/useGameState.ts
  src/pages/Match.tsx
  src/pages/OnlineMatch.tsx
  src/components/PitchCanvas.tsx
  src/engine/simulation.ts
)

for f in "${FILES[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$f")"
  cp "$GAME/$f" "$BACKUP/$f"
done

rollback() {
  echo
  echo "Validation failed. Restoring backup..."
  for f in "${FILES[@]}"; do
    cp "$BACKUP/$f" "$GAME/$f"
  done
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

cd "$ROOT"
node "$SCRIPT_DIR/apply.mjs"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
