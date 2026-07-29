#!/usr/bin/env bash
set -euo pipefail
PITCH="artifacts/fta-game/src/components/PitchCanvas.tsx"
PAD="artifacts/fta-game/src/components/MechanicPad.tsx"
if [ ! -f "$PITCH" ] || [ ! -f "$PAD" ]; then echo "ERROR: Run this from the repository root (~/workspace)."; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/player-polish-$STAMP"
mkdir -p "$BACKUP"
cp "$PITCH" "$BACKUP/PitchCanvas.tsx"
cp "$PAD" "$BACKUP/MechanicPad.tsx"
node "$SCRIPT_DIR/apply-player-polish.mjs"
echo
echo "Backup: $BACKUP"
echo "Installed successfully."
