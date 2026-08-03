#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="src/components/TutorialCoach.tsx"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-a5-$STAMP"

if [ ! -d "$GAME/src" ]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

if [ ! -f "$GAME/$TARGET" ]; then
  echo "ERROR: $GAME/$TARGET was not found."
  exit 1
fi

mkdir -p "$BACKUP/$(dirname "$TARGET")"
cp "$GAME/$TARGET" "$BACKUP/$TARGET"

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Install failed. Restoring the previous tutorial screen..."
  cp "$BACKUP/$TARGET" "$GAME/$TARGET"
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

cp "$SCRIPT_DIR/files/$TARGET" "$GAME/$TARGET"

cd "$GAME"
echo "Tutorial overlay installed. Running checks..."
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
