#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/duplicate-declarations-repair-$STAMP"

mkdir -p "$BACKUP/src/pages" "$BACKUP/src/engine"
cp "$GAME/src/pages/Match.tsx" "$BACKUP/src/pages/Match.tsx"
cp "$GAME/src/pages/OnlineMatch.tsx" "$BACKUP/src/pages/OnlineMatch.tsx"
cp "$GAME/src/engine/ai.ts" "$BACKUP/src/engine/ai.ts"

rollback() {
  echo
  echo "Build failed. Restoring files..."
  cp "$BACKUP/src/pages/Match.tsx" "$GAME/src/pages/Match.tsx"
  cp "$BACKUP/src/pages/OnlineMatch.tsx" "$GAME/src/pages/OnlineMatch.tsx"
  cp "$BACKUP/src/engine/ai.ts" "$GAME/src/engine/ai.ts"
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

node "$SCRIPT_DIR/repair.mjs"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
