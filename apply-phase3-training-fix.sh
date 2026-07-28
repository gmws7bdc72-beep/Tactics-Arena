#!/usr/bin/env bash
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$PATCH_ROOT/artifacts/fta-game"

if [[ -d "$PWD/src" && -f "$PWD/package.json" ]]; then
  TARGET="$PWD"
elif [[ -d "$PWD/artifacts/fta-game/src" ]]; then
  TARGET="$PWD/artifacts/fta-game"
else
  echo "Could not find Football Tactics Arena."
  echo "Run this from either the main Replit workspace or artifacts/fta-game."
  exit 1
fi

SOURCE_REAL="$(cd "$SOURCE" && pwd)"
TARGET_REAL="$(cd "$TARGET" && pwd)"

if [[ "$SOURCE_REAL" != "$TARGET_REAL" ]]; then
  cp -a "$SOURCE/src/." "$TARGET/src/"
  mkdir -p "$TARGET/public"
  cp -a "$SOURCE/public/." "$TARGET/public/"
else
  echo "Patch files are already in the target project directory."
fi

cat > "$TARGET/PHASE-3-TRAINING-FIX-APPLIED.txt" <<'EOF'
Phase 3 training repair applied.
The Team Setup page must show: Lineup | Formation | ⭐ Training.
EOF

echo "Phase 3 training repair applied to: $TARGET"
echo "Team Setup should now show Lineup | Formation | ⭐ Training."
echo "Next run: cd \"$TARGET\" && pnpm typecheck && pnpm build"
