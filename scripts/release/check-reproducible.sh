#!/usr/bin/env bash
# Build the same commit twice with -trimpath and compare bytes.
# Used both locally and in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TMP1="$(mktemp -d)"; TMP2="$(mktemp -d)"
trap 'rm -rf "$TMP1" "$TMP2"' EXIT

build() {
  local out="$1"
  GOFLAGS="-trimpath -buildvcs=false" CGO_ENABLED=0 \
    go build -ldflags "-s -w -X main.version=reprocheck -X main.commit=reprocheck -X main.date=1970-01-01T00:00:00Z" \
    -o "$out/clawgard-server" ./server/cmd/clawgard-server
  GOFLAGS="-trimpath -buildvcs=false" CGO_ENABLED=0 \
    go build -ldflags "-s -w -X main.version=reprocheck -X main.commit=reprocheck -X main.date=1970-01-01T00:00:00Z" \
    -o "$out/clawgard-buddy" ./buddy-cli/cmd/clawgard-buddy
}

build "$TMP1"
build "$TMP2"

for bin in clawgard-server clawgard-buddy; do
  h1=$(shasum -a 256 "$TMP1/$bin" | awk '{print $1}')
  h2=$(shasum -a 256 "$TMP2/$bin" | awk '{print $1}')
  if [ "$h1" != "$h2" ]; then
    echo "FAIL: $bin not reproducible: $h1 vs $h2" >&2
    exit 1
  fi
  echo "OK: $bin $h1"
done
