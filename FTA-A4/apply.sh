#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="src/components/PitchCanvas.tsx"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-a4-$STAMP"

if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

mkdir -p "$BACKUP/$(dirname "$TARGET")"
cp "$GAME/$TARGET" "$BACKUP/$TARGET"

rollback() {
  echo
  echo "Build failed. Restoring backup..."
  cp "$BACKUP/$TARGET" "$GAME/$TARGET"
  echo "Rollback complete: $BACKUP"
}
trap rollback ERR

cp "$SCRIPT_DIR/files/$TARGET" "$GAME/$TARGET"

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
