#!/usr/bin/env bash
set -euo pipefail

GAME="artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/fta-a9-$STAMP"
MANIFEST="$BACKUP/manifest.txt"

FILES=(
  "src/components/TutorialCoach.tsx"
  "src/components/PitchCanvas.tsx"
  "src/game/matchTutorial.ts"
  "src/pages/Match.tsx"
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
echo "Scenario-built tutorial installed. Running checks..."
pnpm typecheck
pnpm build

trap - ERR INT TERM
echo
echo "SUCCESS"
echo "Backup: $BACKUP"
