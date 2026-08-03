#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-a7-$STAMP"
MANIFEST="$BACKUP/manifest.txt"

FILES=(
  "src/engine/ai.ts"
  "src/engine/constants.ts"
  "src/engine/curve.ts"
  "src/engine/simulation.ts"
  "src/game/league.ts"
  "src/game/persistence.ts"
  "src/game/players.ts"
  "src/game/predictionMemory.ts"
  "src/game/transferDatabase.ts"
  "src/game/transferMarket.ts"
  "src/pages/Match.tsx"
  "src/pages/OnlineMatch.tsx"
)

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

for rel in "${FILES[@]}"; do
  if [[ ! -f "$GAME/$rel" ]]; then
    echo "ERROR: Missing current file: $GAME/$rel"
    exit 1
  fi
  if [[ ! -f "$SCRIPT_DIR/files/$rel" ]]; then
    echo "ERROR: Missing patch file: $rel"
    exit 1
  fi
done

mkdir -p "$BACKUP"
: > "$MANIFEST"
for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$rel")"
  cp -p "$GAME/$rel" "$BACKUP/$rel"
  printf 'existing|%s\n' "$rel" >> "$MANIFEST"
done

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Install failed. Restoring previous files..."
  while IFS='|' read -r kind rel; do
    [[ -n "$rel" ]] || continue
    if [[ "$kind" == "existing" ]]; then
      mkdir -p "$GAME/$(dirname "$rel")"
      cp -p "$BACKUP/$rel" "$GAME/$rel"
    fi
  done < "$MANIFEST"
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

for rel in "${FILES[@]}"; do
  mkdir -p "$GAME/$(dirname "$rel")"
  cp -p "$SCRIPT_DIR/files/$rel" "$GAME/$rel"
done

cd "$GAME"
echo "Ghost Run, new-save talent and wage-reserve rules installed. Running checks..."
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
