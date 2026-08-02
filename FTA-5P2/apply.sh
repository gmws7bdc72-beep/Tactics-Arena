#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(pwd)"
GAME="$WORKSPACE/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$WORKSPACE/backups/fta-5p2-$STAMP"
MANIFEST="$BACKUP/manifest.txt"

FILES=(
  src/App.tsx
  src/components/PenaltyShootout.tsx
  src/components/PlayerCard.tsx
  src/engine/ai.ts
  src/engine/types.ts
  src/game/league.ts
  src/game/nameDatabase.ts
  src/game/persistence.ts
  src/game/transferDatabase.ts
  src/game/transferMarket.ts
  src/pages/Home.tsx
  src/pages/Match.tsx
  src/pages/PostMatch.tsx
  src/pages/TeamSetup.tsx
  src/pages/TransferMarket.tsx
)

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

for rel in "${FILES[@]}"; do
  [[ -f "$SCRIPT_DIR/files/$rel" ]] || { echo "ERROR: Missing patch file: $rel"; exit 1; }
done

mkdir -p "$BACKUP"
: > "$MANIFEST"
for rel in "${FILES[@]}"; do
  if [[ -e "$GAME/$rel" ]]; then
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp -p "$GAME/$rel" "$BACKUP/$rel"
    printf 'existing\t%s\n' "$rel" >> "$MANIFEST"
  else
    printf 'new\t%s\n' "$rel" >> "$MANIFEST"
  fi
done

rollback() {
  local status=$?
  trap - ERR INT TERM
  echo
  echo "Patch failed. Restoring previous files..."
  while IFS=$'\t' read -r kind rel; do
    if [[ "$kind" == "existing" ]]; then
      mkdir -p "$GAME/$(dirname "$rel")"
      cp -p "$BACKUP/$rel" "$GAME/$rel"
    else
      rm -f "$GAME/$rel"
    fi
  done < "$MANIFEST"
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

for rel in "${FILES[@]}"; do
  mkdir -p "$GAME/$(dirname "$rel")"
  cp "$SCRIPT_DIR/files/$rel" "$GAME/$rel"
done

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
