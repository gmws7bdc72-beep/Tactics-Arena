#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node FTA-NET1/apply.mjs
