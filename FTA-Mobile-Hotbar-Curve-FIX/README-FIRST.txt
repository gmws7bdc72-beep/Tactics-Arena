FTA Mobile Hotbar + Moving Curve Fix

Run from the repository root:

unzip -o FTA-Mobile-Hotbar-Curve-FIX.zip
bash FTA-Mobile-Hotbar-Curve-FIX/apply-mobile-hotbar-curve-fix.sh
cd artifacts/fta-game
pnpm typecheck && pnpm build

What changes:
- Replaces Pass, Long Ball, Shoot, and Move/Pass words with custom SVG icons.
- Keeps tap Move→Pass / hold Pass→Move behavior.
- Makes the mechanic row a fixed 56px slot.
- Leaves muted empty button frames when no player is selected.
- Keeps the same 56px slot during combo entry, so the pitch does not resize.
- Removes the simulation-side rule that silently stripped movement curves.
- Creates a timestamped backup before changing files.
