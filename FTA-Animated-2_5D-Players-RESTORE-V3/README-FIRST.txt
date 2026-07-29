FTA Animated 2.5D Players — Restore V3

This version fixes both earlier installer bugs:
1. non-global RegExp passed to matchAll()
2. shell script accidentally calling the old V1 folder

Run from ~/workspace:

unzip -o FTA-Animated-2_5D-Players-RESTORE-V3.zip
bash FTA-Animated-2_5D-Players-RESTORE-V3/apply-animated-players.sh
cd artifacts/fta-game
pnpm typecheck && pnpm build
