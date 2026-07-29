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
BACKUP="backups/defensive-curve-dive-final-$STAMP"

mkdir -p "$BACKUP/src/engine" "$BACKUP/src/pages"
cp "$GAME/src/engine/ai.ts" "$BACKUP/src/engine/ai.ts"
cp "$GAME/src/pages/Match.tsx" "$BACKUP/src/pages/Match.tsx"
cp "$GAME/src/pages/OnlineMatch.tsx" "$BACKUP/src/pages/OnlineMatch.tsx"

rollback() {
  echo
  echo "Build failed. Restoring repaired files..."
  cp "$BACKUP/src/engine/ai.ts" "$GAME/src/engine/ai.ts"
  cp "$BACKUP/src/pages/Match.tsx" "$GAME/src/pages/Match.tsx"
  cp "$BACKUP/src/pages/OnlineMatch.tsx" "$GAME/src/pages/OnlineMatch.tsx"
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

node "$SCRIPT_DIR/repair-final.mjs"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $ROOT/$BACKUP"
