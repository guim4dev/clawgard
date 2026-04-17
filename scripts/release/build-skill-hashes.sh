#!/usr/bin/env bash
# Reads checksums.txt from a release download dir, extracts hashes for
# clawgard-buddy archives, and writes a typed hashes.ts consumed by
# skills/buddy-skill at runtime to verify the downloaded binary.
#
# Env:
#   RELEASE_DIR   directory containing checksums.txt (downloaded from the
#                 GH Release by npm-publish.yml's `gh release download` step)
#   OUT           path to hashes.ts to write (typically
#                 skills/buddy-skill/src/hashes.ts)
#   VERSION       version string (without leading 'v')
#
# This script is the goreleaser-archive-format path. The existing
# scripts-dev/build-skill.ts inside the buddy-skill package is the
# per-binary-sidecar path used historically; both coexist — this one consumes
# the authoritative `checksums.txt` emitted by goreleaser and runs only from
# the npm-publish.yml workflow.
#
# Portability: intentionally avoids bash 4+ associative arrays so it runs on
# the stock macOS bash 3.2 for local smoke tests.
set -euo pipefail

: "${RELEASE_DIR:?RELEASE_DIR required}"
: "${OUT:?OUT required}"
: "${VERSION:?VERSION required}"

CHECKSUMS="$RELEASE_DIR/checksums.txt"
[ -f "$CHECKSUMS" ] || { echo "FAIL: $CHECKSUMS not found"; exit 1; }

# Ordered list of (key, filename) pairs. Keep this order stable — it is the
# order the emitted BUDDY_SHA256 object uses.
KEYS=(linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64)
FILES=(
  "clawgard-buddy_${VERSION}_linux_amd64.tar.gz"
  "clawgard-buddy_${VERSION}_linux_arm64.tar.gz"
  "clawgard-buddy_${VERSION}_darwin_amd64.tar.gz"
  "clawgard-buddy_${VERSION}_darwin_arm64.tar.gz"
  "clawgard-buddy_${VERSION}_windows_amd64.zip"
)

HASHES=()
for i in "${!KEYS[@]}"; do
  file="${FILES[$i]}"
  hash=$(awk -v f="$file" '$2 == f {print $1}' "$CHECKSUMS")
  [ -n "$hash" ] || { echo "FAIL: no hash for $file in checksums.txt"; exit 1; }
  HASHES+=("$hash")
done

mkdir -p "$(dirname "$OUT")"
{
  echo '// AUTO-GENERATED at release time by scripts/release/build-skill-hashes.sh.'
  echo '// DO NOT EDIT. Regenerated every tagged release; committed only in published npm tarball.'
  echo ''
  echo "export const BUDDY_VERSION = \"${VERSION}\";"
  echo ''
  echo 'export const BUDDY_SHA256: Record<string, string> = {'
  for i in "${!KEYS[@]}"; do
    echo "  \"${KEYS[$i]}\": \"${HASHES[$i]}\","
  done
  echo '};'
} > "$OUT"

echo "Wrote $OUT"
