Run from ~/workspace:

unzip -o FTA-Mobile-Compact-V3-ROBUST.zip && \
bash FTA-Mobile-Compact-V3-ROBUST/apply-mobile-compact-v3.sh && \
cd artifacts/fta-game && \
pnpm typecheck && pnpm build

Then STOP and START the Replit app, and hard-refresh the browser preview.
