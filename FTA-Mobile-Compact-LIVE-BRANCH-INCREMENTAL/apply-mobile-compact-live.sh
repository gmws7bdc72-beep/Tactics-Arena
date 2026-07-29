#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
GAME="$ROOT/artifacts/fta-game"
SRC="$GAME/src"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/mobile-compact-live-$STAMP"

required=(
  "$SRC/components/PitchCanvas.tsx"
  "$SRC/components/MechanicPad.tsx"
  "$SRC/pages/Match.tsx"
  "$SRC/pages/OnlineMatch.tsx"
  "$SRC/hooks/useCurvePlanner.ts"
)

for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing $file"
    exit 1
  fi
done

mkdir -p "$BACKUP/components" "$BACKUP/pages" "$BACKUP/hooks"
cp "$SRC/components/PitchCanvas.tsx" "$BACKUP/components/"
cp "$SRC/components/MechanicPad.tsx" "$BACKUP/components/"
cp "$SRC/pages/Match.tsx" "$BACKUP/pages/"
cp "$SRC/pages/OnlineMatch.tsx" "$BACKUP/pages/"
cp "$SRC/hooks/useCurvePlanner.ts" "$BACKUP/hooks/"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/MechanicPad.tsx" "$SRC/components/MechanicPad.tsx"

python3 - "$SRC" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1])

def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected 1 exact match in {path}, found {count}")
    path.write_text(text.replace(old, new, 1))
    print(f"patched: {label}")

pitch = src / "components/PitchCanvas.tsx"
replace_once(
    pitch,
    '''  // Slightly zoomed out from the previous version.\n  // Still angled, but not so close that the outside breaks.\n  const CAMERA_ZOOM = isVertical ? 1.12 : 1.08;\n  const CAMERA_SHIFT_X = 0;\n  const CAMERA_SHIFT_Y = isVertical ? 0.015 : 0.015;\n  // Mobile football angle: mostly top-down, slightly rotated.\n  const skew = isVertical ? 0.16 : 0.13;\n  const squash = isVertical ? 0.9 : 0.88;''',
    '''  // Mobile is a fixed, straight top-down view. Desktop keeps the angled presentation.\n  const CAMERA_ZOOM = isVertical ? 1.0 : 1.08;\n  const CAMERA_SHIFT_X = 0;\n  const CAMERA_SHIFT_Y = isVertical ? 0 : 0.015;\n  const skew = isVertical ? 0 : 0.13;\n  const squash = isVertical ? 1 : 0.88;''',
    "fixed straight top-down mobile camera",
)
replace_once(
    pitch,
    '      className="w-full h-full cursor-pointer rounded-lg"',
    '      className="w-full h-full cursor-pointer rounded-none sm:rounded-lg"',
    "remove mobile pitch corner waste",
)

planner = src / "hooks/useCurvePlanner.ts"
replace_once(
    planner,
    '''  curvePointLimitForMechanic,\n  curveRouteFitsMoveBudget,\n  sanitizeCurvePoints,''',
    '''  curvePointLimitForMechanic,\n  sanitizeCurvePoints,''',
    "remove unused dribble-budget warning import",
)
replace_once(
    planner,
    '''    if (\n      baseCommand.type === CommandType.MOVE &&\n      baseCommand.targetPosition &&\n      !curveRouteFitsMoveBudget(\n        selectedPlayer.position,\n        cleanControls,\n        baseCommand.targetPosition,\n        selectedPlayer.stats.speed,\n      )\n    ) {\n      setError("That dribble curve is too long for this player's speed.");\n      return false;\n    }\n''',
    '',
    "remove dribble curve too-long rejection",
)

match = src / "pages/Match.tsx"
replace_once(
    match,
    'className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"',
    'className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2.5 flex-shrink-0"',
    "compact offline match header",
)
replace_once(
    match,
    '<div className="flex-1 relative" style={{ minHeight: 0, padding: "4px 4px 0" }}>',
    '<div className="flex-1 relative" style={{ minHeight: 0, padding: isMobile ? 0 : "4px 4px 0" }}>',
    "maximize offline mobile pitch",
)
replace_once(
    match,
    'className="flex-shrink-0"\n        style={{\n          background: "rgba(0,0,0,0.62)",',
    'className="flex-shrink-0 text-[11px] sm:text-sm"\n        style={{\n          background: "rgba(0,0,0,0.62)",',
    "compact offline control shell",
)
replace_once(
    match,
    'className="flex gap-2 px-4 pt-2.5"',
    'className="flex gap-1.5 px-2 sm:px-4 pt-1.5 sm:pt-2.5"',
    "compact offline combo banner",
)

online = src / "pages/OnlineMatch.tsx"
replace_once(
    online,
    'className="flex items-center justify-between px-3 py-2 flex-shrink-0"',
    'className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0"',
    "compact online match header",
)
replace_once(
    online,
    '<div className="flex-1 flex flex-col items-center justify-center overflow-hidden">',
    '<div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">',
    "protect online pitch height",
)
replace_once(
    online,
    'className="flex-shrink-0 px-2 pt-2"',
    'className="flex-shrink-0 px-1.5 sm:px-2 pt-1 sm:pt-2 text-[11px] sm:text-sm"',
    "compact online action shell",
)
replace_once(
    online,
    '<p className="text-center text-xs mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>',
    '<p className="hidden sm:block text-center text-xs mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>',
    "hide redundant tall hint block on mobile",
)

print("All live-branch mobile compact changes applied.")
PY

echo
echo "Installed successfully. Backup: $BACKUP"
echo "Changed files:"
echo "  artifacts/fta-game/src/components/MechanicPad.tsx"
echo "  artifacts/fta-game/src/components/PitchCanvas.tsx"
echo "  artifacts/fta-game/src/pages/Match.tsx"
echo "  artifacts/fta-game/src/pages/OnlineMatch.tsx"
echo "  artifacts/fta-game/src/hooks/useCurvePlanner.ts"
echo
echo "Now run:"
echo "  cd artifacts/fta-game"
echo "  pnpm typecheck && pnpm build"
