#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${FTA_ROOT:-$HOME/workspace/artifacts/fta-game}"
TARGET="src/game/transferDatabase.ts"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$ROOT/backups/fta-a12-$STAMP"

if [[ ! -d "$ROOT/src" ]]; then
  echo "Could not find the FTA project at: $ROOT"
  echo "Set FTA_ROOT to the project directory and run this installer again."
  exit 1
fi

mkdir -p "$BACKUP_DIR/$(dirname "$TARGET")"
cp "$ROOT/$TARGET" "$BACKUP_DIR/$TARGET"

rollback() {
  echo "Checks failed. Restoring the previous file..."
  cp "$BACKUP_DIR/$TARGET" "$ROOT/$TARGET"
}
trap rollback ERR

cp "$PATCH_DIR/files/$TARGET" "$ROOT/$TARGET"

cd "$ROOT"
pnpm typecheck
pnpm build

trap - ERR
echo "FTA-A12 installed successfully."
echo "Backup: $BACKUP_DIR"
echo "Start a new career to reroll the corrected player generation."
