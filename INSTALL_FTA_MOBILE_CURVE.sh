#!/usr/bin/env bash
set -euo pipefail

ZIP_NAME="${1:-FTA-Mobile-Curve-TopDown-Full-Project.zip}"
WORKSPACE="${REPL_HOME:-$HOME}/workspace"

if [[ ! -d "$WORKSPACE" ]]; then
  WORKSPACE="$PWD"
fi

if [[ ! -f "$ZIP_NAME" ]]; then
  if [[ -f "$WORKSPACE/$ZIP_NAME" ]]; then
    ZIP_NAME="$WORKSPACE/$ZIP_NAME"
  else
    echo "Could not find the ZIP: $ZIP_NAME" >&2
    echo "Upload the ZIP and this shell file to the Replit workspace, then run:" >&2
    echo "bash INSTALL_FTA_MOBILE_CURVE.sh" >&2
    exit 1
  fi
fi

cd "$WORKSPACE"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups

# Preserve the current game source before replacement.
if [[ -d artifacts/fta-game/src ]]; then
  zip -qr "backups/fta-before-mobile-curve-$STAMP.zip" \
    artifacts/fta-game/src \
    artifacts/fta-game/package.json \
    artifacts/fta-game/BUILD_ID.txt 2>/dev/null || true
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
unzip -q "$ZIP_NAME" -d "$TMP_DIR"

PROJECT_ROOT="$TMP_DIR/Tactics-Arena"
if [[ ! -d "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

if [[ -z "${PROJECT_ROOT:-}" || ! -d "$PROJECT_ROOT/artifacts/fta-game/src" ]]; then
  echo "The ZIP does not contain the expected Football Tactics Arena project." >&2
  exit 1
fi

# Fully replace the app source, then copy the rest of the project files over it.
rm -rf artifacts/fta-game/src
mkdir -p artifacts/fta-game
cp -a "$PROJECT_ROOT/artifacts/fta-game/." artifacts/fta-game/
cp -a "$PROJECT_ROOT/.replit" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/pnpm-lock.yaml" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/pnpm-workspace.yaml" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/package.json" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/tsconfig.base.json" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/tsconfig.json" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/lib" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/scripts" . 2>/dev/null || true
cp -a "$PROJECT_ROOT/MOBILE_CURVE_TOPDOWN_UPDATE.md" . 2>/dev/null || true

if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
  pnpm --filter @workspace/fta-game typecheck
else
  echo "Project installed. Replit will install packages when you press Run."
fi

echo
printf 'Installed: '
cat artifacts/fta-game/BUILD_ID.txt
echo "Backup: backups/fta-before-mobile-curve-$STAMP.zip"
echo "Press Run in Replit."
