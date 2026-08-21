#!/usr/bin/env bash
set -euo pipefail

ROOT="${FTA_PROJECT:-$HOME/workspace/artifacts/fta-game}"
FILE="$ROOT/src/game/transferMarket.ts"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-bidfix-$STAMP"

printf '%s\n' 'FTA BIDFIX - long-career transfer bidding repair'
printf 'FTA project: %s\n' "$ROOT"

if [[ ! -f "$FILE" ]]; then
  echo "Missing: $FILE"
  exit 1
fi

mkdir -p "$BACKUP/src/game"
cp "$FILE" "$BACKUP/src/game/transferMarket.ts"

restore() {
  echo 'Patch/check failed; restoring transferMarket.ts...'
  cp "$BACKUP/src/game/transferMarket.ts" "$FILE"
}
trap restore ERR

FTA_PROJECT="$ROOT" node "$(dirname "$0")/apply.mjs"

cd "$ROOT"
if command -v pnpm >/dev/null 2>&1; then
  pnpm typecheck
elif command -v npm >/dev/null 2>&1; then
  npm run typecheck
elif command -v tsc >/dev/null 2>&1; then
  tsc -p tsconfig.json --noEmit
else
  echo 'No typechecker available; patch applied without typecheck.'
fi

trap - ERR
echo 'FTA BIDFIX applied successfully.'
echo "Backup: $BACKUP"
