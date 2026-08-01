#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-5m-$STAMP"
FILES=(
  src/pages/Match.tsx
  src/pages/OnlineMatch.tsx
)

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

mkdir -p "$BACKUP"
for file in "${FILES[@]}"; do
  [[ -f "$GAME/$file" ]] || { echo "ERROR: Missing $GAME/$file"; exit 1; }
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp -p "$GAME/$file" "$BACKUP/$file"
done

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Patch failed. Restoring previous files..."
  for file in "${FILES[@]}"; do
    cp -p "$BACKUP/$file" "$GAME/$file"
  done
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

node "$SCRIPT_DIR/apply.mjs"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR INT TERM
printf '\nSUCCESS\nBackup: %s\n' "$BACKUP"
