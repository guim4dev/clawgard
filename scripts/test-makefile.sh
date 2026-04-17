#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Every make target listed below must exist.
for target in lint test generate build; do
  make -n "$target" >/dev/null 2>&1 || { echo "missing make target: $target"; exit 1; }
done
echo "all targets present"
