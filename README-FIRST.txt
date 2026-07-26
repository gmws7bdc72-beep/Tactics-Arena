FOOTBALL TACTICS ARENA — PLAYER SIZE, NAMEPLATES, AND KICK ANIMATIONS UPDATE

This ZIP is meant to be extracted over the already-installed Visual Overhaul project.
It overwrites only seven source files.

From the main Replit project workspace, run:

  unzip -o FTA-Player-Scale-Names-Kick-Animations-PATCH.zip
  cd artifacts/fta-game
  pnpm typecheck && pnpm build

Then test the game and redeploy the Replit app.

Included changes:
- Player sprites are 12% larger without changing collision or simulation sizes.
- Player names sit below/around the feet instead of above the head.
- Ground passes use a short, compact inside-foot motion.
- Long balls use a smoother, graceful full-body kick.
- Shots use a faster, more explosive version of the long-ball motion.
- Players turn toward the pass/shot target during the wind-up.
- Move-then-pass combo commands now show the passing animation too.

No cache deletion is required.
