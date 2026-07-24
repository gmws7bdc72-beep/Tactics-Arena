#!/usr/bin/env bash
set -Eeuo pipefail

# Football Tactics Arena — complete 2.5D player/kit/animation overhaul.
# Generated against the uploaded Tactics Arena source snapshot.
# No dependencies are added. On validation failure, every touched file is restored.

say() { printf '\n\033[1;36m[FTA]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[FTA ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

find_game_root() {
  local candidate found
  for candidate in     "$PWD"     "$PWD/artifacts/fta-game"     "${HOME:-}/workspace/artifacts/fta-game"     "${HOME:-}/artifacts/fta-game"
  do
    if [[ -n "$candidate" && -f "$candidate/package.json" && -f "$candidate/src/components/PitchCanvas.tsx" ]]; then
      (cd "$candidate" && pwd -P)
      return 0
    fi
  done

  if [[ -n "${HOME:-}" ]]; then
    found="$(find "$HOME" -maxdepth 7 -type f -path '*/artifacts/fta-game/src/components/PitchCanvas.tsx' -print -quit 2>/dev/null || true)"
    if [[ -n "$found" ]]; then
      dirname "$(dirname "$(dirname "$found")")"
      return 0
    fi
  fi
  return 1
}

ROOT="$(find_game_root)" || fail "Could not find artifacts/fta-game. Open the Replit Shell from the project workspace and run this script again."
cd "$ROOT"

[[ -f src/engine/types.ts ]] || fail "Wrong project root: $ROOT"
[[ -f src/pages/Customize.tsx ]] || fail "Customize.tsx is missing from $ROOT"
command -v git >/dev/null 2>&1 || fail "git is required to apply the migration safely."
command -v gzip >/dev/null 2>&1 || fail "gzip is required to unpack the embedded patch."
command -v base64 >/dev/null 2>&1 || fail "base64 is required to unpack the embedded patch."

say "Project root: $ROOT"

PATCH_FILE="$(mktemp "${TMPDIR:-/tmp}/fta-visual-overhaul.XXXXXX.patch")"
cleanup_temp() { rm -f "$PATCH_FILE"; }
trap cleanup_temp EXIT

cat <<'FTA_VISUAL_PATCH_B64' | base64 --decode | gzip --decompress > "$PATCH_FILE"
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
S1DR5sH/Bfe2b3M74AAA
FTA_VISUAL_PATCH_B64

EXPECTED_SHA="688822c6904338ea53b546f47a23725eff557c0cfbaf9f14c3589b752054c8ab"
ACTUAL_SHA="$(sha256sum "$PATCH_FILE" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || fail "Embedded patch checksum failed. Nothing was changed."

# Make the script safe to run twice.
if git apply --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
  say "The visual overhaul is already installed. No files were changed."
  if [[ "${FTA_SKIP_BUILD:-0}" != "1" ]]; then
    if command -v pnpm >/dev/null 2>&1; then
      say "Running a fresh build check..."
      pnpm build
    elif command -v corepack >/dev/null 2>&1; then
      say "Running a fresh build check through Corepack..."
      corepack pnpm build
    else
      say "pnpm was not found, so the repeat-run build check was skipped."
    fi
  fi
  exit 0
fi

say "Checking that this Replit copy matches the uploaded source snapshot..."
if ! git apply --check "$PATCH_FILE"; then
  fail "The patch does not match the current files. No changes were made. Your Replit copy probably changed after the ZIP was uploaded; use the accompanying .patch to inspect the conflict."
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$ROOT/.change-backups/visual-overhaul-$STAMP"
BACKUP_ARCHIVE="$BACKUP_DIR/original-files.tar.gz"
mkdir -p "$BACKUP_DIR"

EXISTING_FILES=(
  src/components/PitchCanvas.tsx
  src/engine/simulation.ts
  src/engine/types.ts
  src/game/league.ts
  src/game/persistence.ts
  src/pages/Customize.tsx
  src/pages/Match.tsx
  src/pages/OnlineLobby.tsx
  src/pages/OnlineMatch.tsx
)
NEW_FILES=(
  src/components/render/AnimatedPlayerSprite.ts
  src/game/visuals.ts
)
ALL_CHANGED_FILES=("${EXISTING_FILES[@]}" "${NEW_FILES[@]}")

say "Backing up every existing file that will be touched..."
tar -czf "$BACKUP_ARCHIVE" "${EXISTING_FILES[@]}"
printf '%s\n' "${NEW_FILES[@]}" > "$BACKUP_DIR/new-files-created.txt"
printf '%s\n' "${ALL_CHANGED_FILES[@]}" > "$BACKUP_DIR/all-changed-files.txt"
cp "$PATCH_FILE" "$BACKUP_DIR/visual-overhaul.patch"

APPLIED=0
rollback_on_error() {
  local status=$?
  trap - EXIT
  rm -f "$PATCH_FILE"

  if (( status != 0 && APPLIED == 1 )); then
    printf '\n\033[1;33m[FTA] Validation failed. Restoring the original project files...\033[0m\n' >&2
    rm -f "${NEW_FILES[@]}"
    tar -xzf "$BACKUP_ARCHIVE" -C "$ROOT"
    printf '\033[1;33m[FTA] Rollback complete. Backup retained at: %s\033[0m\n' "$BACKUP_DIR" >&2
  fi
  exit "$status"
}
trap rollback_on_error EXIT

say "Applying the full visual overhaul..."
git apply "$PATCH_FILE"
APPLIED=1

# Fast structural checks before invoking the compiler.
grep -q 'drawAnimatedPlayerSprite' src/components/PitchCanvas.tsx || fail "Pitch renderer hook was not installed."
grep -q 'getPossessionBallOffset' src/components/PitchCanvas.tsx || fail "Dribble presentation hook was not installed."
grep -q 'export function createPlayerAppearance' src/game/visuals.ts || fail "Procedural appearance generator is missing."
grep -q 'export function drawAnimatedPlayerSprite' src/components/render/AnimatedPlayerSprite.ts || fail "Animated sprite renderer is missing."
grep -q 'Kit Workshop' src/pages/Customize.tsx || fail "Kit customization screen was not installed."

if [[ "${FTA_SKIP_BUILD:-0}" == "1" ]]; then
  say "FTA_SKIP_BUILD=1: compiler and production build checks were skipped."
else
  if command -v pnpm >/dev/null 2>&1; then
    PNPM=(pnpm)
  elif command -v corepack >/dev/null 2>&1; then
    PNPM=(corepack pnpm)
  else
    fail "pnpm was not found. The migration was rolled back rather than leaving unvalidated code."
  fi

  say "Running the complete TypeScript check..."
  "${PNPM[@]}" typecheck

  say "Running the production build..."
  "${PNPM[@]}" build
fi

APPLIED=0
trap - EXIT
cleanup_temp

say "Visual overhaul installed successfully."
printf '
Implemented:
'
printf '  • deterministic hairstyles, hair colors, skin tones, and facial hair
'
printf '  • solid, vertical-stripe, horizontal-stripe, and diagonal-sash shirts
'
printf '  • primary, secondary, and split sleeve treatments
'
printf '  • shirt-only Kit Workshop with live jersey preview
'
printf '  • animated idle, run, dribble, pass, shot, contest, and recovery poses
'
printf '  • eight-direction player facing
'
printf '  • presentation-only dribble touches that never alter simulation physics
'
printf '  • ball snapback to possession when movement stops
'
printf '  • offline and online kit/appearance propagation
'
printf '
Backup: %s
' "$BACKUP_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '
Changed-file summary:
'
  git diff --stat -- "${ALL_CHANGED_FILES[@]}" || true
fi

printf '
IMPORTANT: Redeploy the Replit app after testing, or the published site will keep showing the previous version.
'
