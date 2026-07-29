Run from ~/workspace:

unzip -o FTA-Gameplay-Tweaks-Patch-CORRECTED.zip
bash FTA-Gameplay-Tweaks-Patch-CORRECTED/apply-patch.sh

This corrected package fixes the TransferNewsKind TypeScript inference error in useGameState.ts.
The installer backs up the six modified files and rolls back automatically if typecheck or build fails.
