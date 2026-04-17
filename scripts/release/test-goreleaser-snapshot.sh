#!/usr/bin/env bash
# Snapshot test for .goreleaser.yaml — builds all Go binaries without signing
# or publishing, verifies the expected matrix is produced. Run locally before
# tagging; also runs as part of CI pre-flight via the Makefile / workflow.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

goreleaser check
rm -rf dist
goreleaser build --snapshot --clean

# Expected matrix: 5 OS/arch combos x 2 binaries = 10 artifacts
expected=(
  dist/clawgard-server_linux_amd64_v1/clawgard-server
  dist/clawgard-server_linux_arm64_v8.0/clawgard-server
  dist/clawgard-server_darwin_amd64_v1/clawgard-server
  dist/clawgard-server_darwin_arm64_v8.0/clawgard-server
  dist/clawgard-server_windows_amd64_v1/clawgard-server.exe
  dist/clawgard-buddy_linux_amd64_v1/clawgard-buddy
  dist/clawgard-buddy_linux_arm64_v8.0/clawgard-buddy
  dist/clawgard-buddy_darwin_amd64_v1/clawgard-buddy
  dist/clawgard-buddy_darwin_arm64_v8.0/clawgard-buddy
  dist/clawgard-buddy_windows_amd64_v1/clawgard-buddy.exe
)

for f in "${expected[@]}"; do
  [ -f "$f" ] || { echo "FAIL: missing $f"; exit 1; }
done
echo "snapshot OK"
