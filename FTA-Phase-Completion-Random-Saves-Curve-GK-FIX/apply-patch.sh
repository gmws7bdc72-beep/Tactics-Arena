#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
GAME="$ROOT/artifacts/fta-game"
PATCH="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$GAME/package.json" ]]; then
  echo "ERROR: Run this from your Replit workspace root (the folder containing artifacts/fta-game)."
  exit 1
fi
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.fta-backups/phase-completion-random-curve-gk-$STAMP"
mkdir -p "$BACKUP"
echo "Backing up changed files to $BACKUP"
while IFS= read -r -d '' file; do
  rel="${file#"$PATCH/files/"}"
  if [[ -f "$GAME/$rel" ]]; then
    mkdir -p "$BACKUP/$(dirname "$rel")"
    cp "$GAME/$rel" "$BACKUP/$rel"
  fi
done < <(find "$PATCH/files" -type f -print0)
cp -R "$PATCH/files/." "$GAME/"
echo "Patch installed. Running checks..."
cd "$GAME"
if pnpm typecheck && pnpm build; then
  echo "SUCCESS: Phase completion, long balls, random saves, naming, curve limits and GK dive fixes installed."
else
  echo "CHECK FAILED — restoring backup."
  cp -R "$BACKUP/." "$GAME/"
  echo "Rollback complete. Your previous version has been restored."
  exit 1
fi
