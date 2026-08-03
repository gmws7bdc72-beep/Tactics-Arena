#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-a6-$STAMP"
MANIFEST="$BACKUP/manifest.txt"

FILES=(
  "src/App.tsx"
  "src/game/tutorial.ts"
  "src/pages/TransferTutorial.tsx"
  "src/pages/TeamNameSetup.tsx"
)

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

for rel in "${FILES[@]}"; do
  if [[ ! -f "$SCRIPT_DIR/files/$rel" ]]; then
    echo "ERROR: Patch file missing: $rel"
    exit 1
  fi
done

mkdir -p "$BACKUP"
: > "$MANIFEST"
for rel in "${FILES[@]}"; do
  if [[ -e "$GAME/$rel" ]]; then
    echo "existing|$rel" >> "$MANIFEST"
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp -p "$GAME/$rel" "$BACKUP/$rel"
  else
    echo "new|$rel" >> "$MANIFEST"
  fi
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
  cp -p "$SCRIPT_DIR/files/$rel" "$GAME/$rel"
done

cd "$GAME"
echo "Club naming flow installed. Running checks..."
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
