#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-anim-$STAMP"
FILE="src/components/PitchCanvas.tsx"

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

if [[ ! -f "$GAME/$FILE" || ! -f "$SCRIPT_DIR/files/$FILE" ]]; then
  echo "ERROR: PitchCanvas.tsx is missing."
  exit 1
fi

mkdir -p "$BACKUP/$(dirname "$FILE")"
cp -p "$GAME/$FILE" "$BACKUP/$FILE"

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Patch failed. Restoring the previous animation file..."
  cp -p "$BACKUP/$FILE" "$GAME/$FILE"
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

cp -p "$SCRIPT_DIR/files/$FILE" "$GAME/$FILE"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
