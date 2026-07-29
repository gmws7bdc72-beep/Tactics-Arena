#!/usr/bin/env bash
set -euo pipefail

TARGET="artifacts/fta-game/src/components/MechanicPad.tsx"
if [ ! -f "$TARGET" ]; then
  echo "ERROR: Run this from the repository root (~/workspace)."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/mechanic-pad-hotfix-$STAMP"
mkdir -p "$BACKUP"
cp "$TARGET" "$BACKUP/MechanicPad.tsx"

node "$SCRIPT_DIR/apply-hotfix.mjs"

echo
echo "Backup: $BACKUP"
echo "Installed successfully."
