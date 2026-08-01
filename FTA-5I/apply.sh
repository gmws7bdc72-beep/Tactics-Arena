#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-5i-$STAMP"

FILES=(
  src/engine/types.ts
  src/engine/simulation.ts
  src/engine/ai.ts
  src/components/PitchCanvas.tsx
  src/components/MechanicPad.tsx
  src/pages/Match.tsx
  src/pages/OnlineMatch.tsx
)

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

mkdir -p "$BACKUP"
for file in "${FILES[@]}"; do
  if [[ ! -f "$GAME/$file" ]]; then
    echo "ERROR: Missing $GAME/$file"
    exit 1
  fi
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp -p "$GAME/$file" "$BACKUP/$file"
done

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Patch failed. Restoring the previous files..."
  for file in "${FILES[@]}"; do
    cp -p "$BACKUP/$file" "$GAME/$file"
  done
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

for file in "${FILES[@]}"; do
  cp -p "$SCRIPT_DIR/files/$file" "$GAME/$file"
done

cd "$GAME"
if [[ "${FTA_SKIP_BUILD:-0}" != "1" ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "ERROR: pnpm is not available in this Shell."
    false
  fi
  pnpm typecheck
  pnpm build
fi

trap - ERR INT TERM
printf '\nSUCCESS\nBackup: %s\n' "$BACKUP"
