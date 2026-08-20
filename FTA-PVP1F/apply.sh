#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$ROOT/artifacts/fta-game"

if [ ! -f "$PROJECT/package.json" ]; then
  echo "Could not find $PROJECT"
  echo "Run this from ~/workspace"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found."
  exit 1
fi

echo "FTA PVP1F — online kickoff + 100 OVR + long-ball goals"
node "$PATCH_DIR/apply.mjs"

echo
echo "Typechecking..."
cd "$PROJECT"
if npm run typecheck; then
  echo
  echo "PVP1F applied successfully."
else
  echo
  echo "Typecheck failed. Restoring newest PVP1F backup..."
  BACKUP="$(ls -dt "$PROJECT"/backups/fta-pvp1f-* 2>/dev/null | head -n 1 || true)"
  if [ -n "$BACKUP" ]; then
    cp -f "$BACKUP/src/pages/OnlineMatch.tsx" "$PROJECT/src/pages/OnlineMatch.tsx"
    cp -f "$BACKUP/src/engine/simulation.ts" "$PROJECT/src/engine/simulation.ts"
    cp -f "$BACKUP/src/components/PitchCanvas.tsx" "$PROJECT/src/components/PitchCanvas.tsx"
    echo "Rolled back from: $BACKUP"
  fi
  exit 1
fi
