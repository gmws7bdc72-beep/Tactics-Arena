Run from the repository root:

unzip -o FTA-Mobile-Compact-CORRECTION.zip
bash FTA-Mobile-Compact-CORRECTION/apply-mobile-compact-correction.sh
cd artifacts/fta-game
pnpm typecheck && pnpm build

Visible corrections:
- Mobile camera is exactly straight top-down (not merely less angled).
- Dribble curve speed rejection is removed.
- Combo button shows compact M → P; while held it shows P → M.
