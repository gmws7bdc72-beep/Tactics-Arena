#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
GAME="$ROOT/artifacts/fta-game"
SRC="$GAME/src"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/mobile-compact-live-$STAMP"

required=(
  "$SRC/components/PitchCanvas.tsx"
  "$SRC/components/MechanicPad.tsx"
  "$SRC/pages/Match.tsx"
  "$SRC/pages/OnlineMatch.tsx"
  "$SRC/hooks/useCurvePlanner.ts"
)

for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing $file"
    exit 1
  fi
done

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required but was not found"
  exit 1
fi

mkdir -p "$BACKUP/components" "$BACKUP/pages" "$BACKUP/hooks"
cp "$SRC/components/PitchCanvas.tsx" "$BACKUP/components/"
cp "$SRC/components/MechanicPad.tsx" "$BACKUP/components/"
cp "$SRC/pages/Match.tsx" "$BACKUP/pages/"
cp "$SRC/pages/OnlineMatch.tsx" "$BACKUP/pages/"
cp "$SRC/hooks/useCurvePlanner.ts" "$BACKUP/hooks/"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/MechanicPad.tsx" "$SRC/components/MechanicPad.tsx"
node "$SCRIPT_DIR/patch-mobile-compact.mjs" "$SRC"

echo
echo "Installed successfully. Backup: $BACKUP"
echo "Changed files:"
echo "  artifacts/fta-game/src/components/MechanicPad.tsx"
echo "  artifacts/fta-game/src/components/PitchCanvas.tsx"
echo "  artifacts/fta-game/src/pages/Match.tsx"
echo "  artifacts/fta-game/src/pages/OnlineMatch.tsx"
echo "  artifacts/fta-game/src/hooks/useCurvePlanner.ts"
echo
echo "Now run:"
echo "  cd artifacts/fta-game"
echo "  pnpm typecheck && pnpm build"
