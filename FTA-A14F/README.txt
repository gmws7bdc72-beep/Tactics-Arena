FTA-A14F

Install from Replit Shell:

  cd ~/workspace
  unzip -o FTA-A14F.zip
  bash FTA-A14F/apply.sh

The installer backs up every replaced file, runs pnpm typecheck and pnpm build,
and restores the backup automatically if either check fails.

Existing saves are repaired when loaded. New ability development begins with the
next processed training week.


A14F correction:
- Fixes PitchCanvas TS2339 at lines 798 and 2492.
- The render snapshot now carries the authoritative SimPlayer ability value.
- No duplicate independent ability state is created.
