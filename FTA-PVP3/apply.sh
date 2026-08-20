#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "FTA PVP3 - goal starts next turn at kickoff"
node FTA-PVP3/apply.mjs
