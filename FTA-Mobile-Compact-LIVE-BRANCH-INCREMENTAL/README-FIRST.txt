FTA MOBILE COMPACT — LIVE BRANCH INCREMENTAL
Target baseline: GitHub branch fta-current-game-backup

INSTALL FROM REPOSITORY ROOT:
  unzip -o FTA-Mobile-Compact-LIVE-BRANCH-INCREMENTAL.zip
  bash FTA-Mobile-Compact-LIVE-BRANCH-INCREMENTAL/apply-mobile-compact-live.sh
  cd artifacts/fta-game
  pnpm typecheck && pnpm build

WHAT CHANGES:
- Fixed straight top-down mobile camera; desktop camera remains angled.
- Keeps the existing animated 2D player rendering untouched.
- Replaces the tall 2x2 mechanic grid with one compact horizontal control row.
- Tap Move+Pass for Move -> Pass; hold it for Pass -> Move.
- Curve stays visible at the right edge and retains dribble/pass/long-ball/shot support.
- Removes the specific dribble-curve-too-long warning/rejection.
- Shrinks offline and online match headers/action shells on mobile.
- Gives the pitch more usable mobile screen area.
- Does not add global overflow rules, so scrolling menus are not disabled.
- Creates timestamped backups before changing files.

The installer uses exact source anchors and stops instead of guessing if the live files do not match the target branch.
