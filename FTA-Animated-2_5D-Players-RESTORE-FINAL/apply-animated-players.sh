#!/usr/bin/env bash
set -euo pipefail

TARGET="artifacts/fta-game/src/components/PitchCanvas.tsx"

if [ ! -f "$TARGET" ]; then
  echo "ERROR: Run this from the repository root (~/workspace)."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/animated-2_5d-final-$STAMP"

mkdir -p "$BACKUP"
cp "$TARGET" "$BACKUP/PitchCanvas.tsx"

node "$SCRIPT_DIR/apply-animated-players.mjs"

echo
echo "Backup: $BACKUP"
echo "Installed successfully."
