Install from the Replit shell:

cd ~/workspace
unzip -o FTA-A13.zip
bash FTA-A13/apply.sh

The installer backs up every replaced file, runs pnpm typecheck and pnpm build,
and restores the backup automatically if either check fails.
