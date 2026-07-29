FTA Animated 2.5D Players — FINAL RESTORE

Run from ~/workspace:

unzip -o FTA-Animated-2_5D-Players-RESTORE-FINAL.zip && \
bash FTA-Animated-2_5D-Players-RESTORE-FINAL/apply-animated-players.sh && \
cd artifacts/fta-game && \
pnpm typecheck && pnpm build

This installer was tested before packaging against the current PitchCanvas structure.

It fixes every earlier installer failure:
- no matchAll() use
- no hard-coded old folder path
- no fragile search for the closing player brace
- no partial writes
- only the rendered-player loop is changed
- rerunning is safe and exits cleanly
- a timestamped backup is created first
