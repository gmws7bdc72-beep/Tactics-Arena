FTA Player Polish — MechanicPad Hotfix

Fixes the two TypeScript errors in Match.tsx and OnlineMatch.tsx by restoring
the active prop expected by both pages.

It also preserves the fixed hotbar frame while hiding all icons when no player
is selected.

Run from ~/workspace:

unzip -o FTA-Player-Polish-Action-Animations-HOTFIX.zip && \
bash FTA-Player-Polish-Action-Animations-HOTFIX/apply-hotfix.sh && \
cd artifacts/fta-game && \
pnpm typecheck && pnpm build
