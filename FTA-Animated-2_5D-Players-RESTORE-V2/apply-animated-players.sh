#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TARGET="artifacts/fta-game/src/components/PitchCanvas.tsx"

if [ ! -f "$TARGET" ]; then
  echo "ERROR: Run this from the repository root (~/workspace)."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/animated-2_5d-players-$STAMP"
mkdir -p "$BACKUP"
cp "$TARGET" "$BACKUP/PitchCanvas.tsx"

node FTA-Animated-2_5D-Players-RESTORE/apply-animated-players.mjs

echo
echo "Backup: $BACKUP"
echo "Installed successfully."
