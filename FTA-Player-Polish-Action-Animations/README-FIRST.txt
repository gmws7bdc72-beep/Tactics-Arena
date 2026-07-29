FTA Player Polish + Action Animations

Run from ~/workspace:

unzip -o FTA-Player-Polish-Action-Animations.zip && \
bash FTA-Player-Polish-Action-Animations/apply-player-polish.sh && \
cd artifacts/fta-game && \
pnpm typecheck && pnpm build

Adds polished anatomy, idle/run/dribble/pass/long-ball/shot/contest/recovery poses, and clean icon-only controls.
