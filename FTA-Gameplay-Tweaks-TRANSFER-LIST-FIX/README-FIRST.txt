FTA gameplay tweaks — transfer-list transformation correction

This version corrects the new-season transformation rule:
- Only AI players who are still marked "listed" at season end are eligible.
- The eligible league-wide pool is shuffled randomly.
- Up to 10 unsold listed players are transformed.
- If fewer than 10 eligible players remain, no unrelated player is transformed.
- Season news reports the actual number and whether each replacement is better or worse.

Install from the Replit workspace root:
  unzip -o FTA-Gameplay-Tweaks-TRANSFER-LIST-FIX.zip
  bash FTA-Gameplay-Tweaks-TRANSFER-LIST-FIX/apply-patch.sh
