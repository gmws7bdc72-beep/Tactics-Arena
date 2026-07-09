#!/usr/bin/env bash
set -e

PORT_TO_USE="${PORT:-4173}"

echo "Starting Football Tactics Arena"
echo "PORT=$PORT_TO_USE"

pnpm exec vite preview \
  --config vite.config.ts \
  --host 0.0.0.0 \
  --port "$PORT_TO_USE"
