FTA Animated 2.5D Players — Restore

Run from ~/workspace:

unzip -o FTA-Animated-2_5D-Players-RESTORE.zip
bash FTA-Animated-2_5D-Players-RESTORE/apply-animated-players.sh
cd artifacts/fta-game
pnpm typecheck && pnpm build

What changes:
- Restores continuous canvas redraw at about 30 FPS.
- Adds subtle idle breathing/bobbing.
- Adds alternating arm and leg motion while simulating.
- Keeps the existing 2.5D canvas character design, names, kits, shadows, selection rings, and mobile camera changes.
- Changes only PitchCanvas.tsx.

V2 fixes the Node.js matchAll/non-global RegExp installer crash.
