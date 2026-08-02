#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-5n-$STAMP"

FILES=(
  src/engine/types.ts
  src/game/transferDatabase.ts
  src/game/league.ts
  src/game/persistence.ts
  src/game/transferMarket.ts
  src/hooks/useGameState.ts
  src/pages/Customize.tsx
)

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

mkdir -p "$BACKUP"
for file in "${FILES[@]}"; do
  [[ -f "$GAME/$file" ]] || { echo "ERROR: Missing $GAME/$file"; exit 1; }
  [[ -f "$SCRIPT_DIR/files/$file" ]] || { echo "ERROR: Patch file missing: $file"; exit 1; }
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp -p "$GAME/$file" "$BACKUP/$file"
done

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Patch failed. Restoring the previous files..."
  for file in "${FILES[@]}"; do
    cp -p "$BACKUP/$file" "$GAME/$file"
  done
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

for file in "${FILES[@]}"; do
  cp -p "$SCRIPT_DIR/files/$file" "$GAME/$file"
done

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR INT TERM
printf '\nSUCCESS\nBackup: %s\n' "$BACKUP"
