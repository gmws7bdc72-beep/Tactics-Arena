#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/fta-tut-$STAMP"

EXISTING=(
  src/App.tsx
  src/pages/Home.tsx
  src/pages/TransferMarket.tsx
  src/pages/Match.tsx
  src/components/MechanicPad.tsx
)

NEW=(
  src/pages/TransferTutorial.tsx
  src/components/TutorialCoach.tsx
  src/components/TutorialWelcome.tsx
  src/game/tutorial.ts
  src/game/matchTutorial.ts
)

ALL=("${EXISTING[@]}" "${NEW[@]}")

if [[ ! -d "$GAME/src" || ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from ~/workspace."
  exit 1
fi

for file in "${EXISTING[@]}"; do
  [[ -f "$GAME/$file" ]] || { echo "ERROR: Missing $GAME/$file"; exit 1; }
done
for file in "${ALL[@]}"; do
  [[ -f "$SCRIPT_DIR/files/$file" ]] || { echo "ERROR: Patch file missing: $file"; exit 1; }
done

mkdir -p "$BACKUP"
for file in "${EXISTING[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp -p "$GAME/$file" "$BACKUP/$file"
done

# Preserve any pre-existing tutorial files too, so reapplying stays safe.
for file in "${NEW[@]}"; do
  if [[ -f "$GAME/$file" ]]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp -p "$GAME/$file" "$BACKUP/$file"
    printf '%s\n' "$file" >> "$BACKUP/preexisting-new-files.txt"
  fi
done

rollback() {
  status=$?
  trap - ERR INT TERM
  echo
  echo "Patch failed. Restoring the previous files..."
  for file in "${EXISTING[@]}"; do
    cp -p "$BACKUP/$file" "$GAME/$file"
  done
  for file in "${NEW[@]}"; do
    if [[ -f "$BACKUP/$file" ]]; then
      cp -p "$BACKUP/$file" "$GAME/$file"
    else
      rm -f "$GAME/$file"
    fi
  done
  echo "Rollback complete: $BACKUP"
  exit "$status"
}
trap rollback ERR INT TERM

for file in "${ALL[@]}"; do
  mkdir -p "$GAME/$(dirname "$file")"
  cp -p "$SCRIPT_DIR/files/$file" "$GAME/$file"
done

cd "$GAME"
pnpm typecheck
pnpm build

trap - ERR INT TERM
printf '\nSUCCESS\nBackup: %s\n' "$BACKUP"
