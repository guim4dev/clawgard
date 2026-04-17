#!/usr/bin/env bash
# Verifies build-skill-hashes.sh produces a valid hashes.ts given a mock
# checksums.txt. Runs in CI (ci.yml) and locally before committing changes
# to the script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fake release download dir
mkdir -p "$TMP/release"
cat > "$TMP/release/checksums.txt" <<'EOF'
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  clawgard-buddy_0.1.0_linux_amd64.tar.gz
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  clawgard-buddy_0.1.0_linux_arm64.tar.gz
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  clawgard-buddy_0.1.0_darwin_amd64.tar.gz
dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd  clawgard-buddy_0.1.0_darwin_arm64.tar.gz
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee  clawgard-buddy_0.1.0_windows_amd64.zip
ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff  clawgard-server_0.1.0_linux_amd64.tar.gz
EOF

mkdir -p "$TMP/skill/src"
OUT_FILE="$TMP/skill/src/hashes.ts"
OUT="$OUT_FILE" RELEASE_DIR="$TMP/release" VERSION="0.1.0" \
  bash "$ROOT/scripts/release/build-skill-hashes.sh"

grep -q '"linux-amd64": "aaaa' "$OUT_FILE" || { echo "FAIL: missing linux-amd64 entry"; cat "$OUT_FILE"; exit 1; }
grep -q '"darwin-arm64": "dddd' "$OUT_FILE" || { echo "FAIL: missing darwin-arm64 entry"; cat "$OUT_FILE"; exit 1; }
grep -q '"windows-amd64": "eeee' "$OUT_FILE" || { echo "FAIL: missing windows-amd64 entry"; cat "$OUT_FILE"; exit 1; }
! grep -q 'server' "$OUT_FILE" || { echo "FAIL: should not contain server hashes"; exit 1; }
grep -q 'export const BUDDY_VERSION = "0.1.0"' "$OUT_FILE" || { echo "FAIL: missing version"; cat "$OUT_FILE"; exit 1; }
echo "hash injection OK"
