#!/usr/bin/env bash
# Downloads every artifact from a given tag's GitHub Release and verifies
# Cosign signatures + checksum file.
#
# Usage: scripts/release/verify-release.sh v0.1.0
#
# Env overrides:
#   REPO              override the default repo (clawgard/clawgard)
#   LOCAL_DIR         smoke-test mode: verify a local dist/ directory instead
#                     of downloading from GitHub. No signature verification is
#                     possible in this mode (keyless sigs need the release
#                     identity); only presence + checksum coherence are
#                     checked. Used by Task 13 to exercise the script against
#                     `goreleaser release --snapshot --skip=publish` output.
set -euo pipefail

VERSION="${1:?usage: verify-release.sh vX.Y.Z}"
REPO="${REPO:-clawgard/clawgard}"

if [ -n "${LOCAL_DIR:-}" ]; then
  WORKDIR="$(cd "$LOCAL_DIR" && pwd)"
  echo ">> Local smoke-test mode against $WORKDIR (no signatures expected)"
else
  WORKDIR="$(mktemp -d)"
  trap 'rm -rf "$WORKDIR"' EXIT
  cd "$WORKDIR"
  echo ">> Downloading release artifacts for $VERSION"
  gh release download "$VERSION" -R "$REPO" -D .
fi

cd "$WORKDIR"

if [ -z "${LOCAL_DIR:-}" ]; then
  echo ">> Verifying checksums.txt signature"
  cosign verify-blob \
    --certificate checksums.txt.pem \
    --signature checksums.txt.sig \
    --certificate-identity-regexp "^https://github\\.com/${REPO}/\\.github/workflows/release\\.yml@refs/tags/${VERSION}$" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    checksums.txt
fi

echo ">> Verifying archive signatures"
while IFS= read -r archive; do
  base="$(basename "$archive")"
  if [ -z "${LOCAL_DIR:-}" ]; then
    [ -f "${archive}.sig" ] || { echo "FAIL: missing ${archive}.sig"; exit 1; }
    [ -f "${archive}.pem" ] || { echo "FAIL: missing ${archive}.pem"; exit 1; }
    cosign verify-blob \
      --certificate "${archive}.pem" \
      --signature "${archive}.sig" \
      --certificate-identity-regexp "^https://github\\.com/${REPO}/\\.github/workflows/release\\.yml@refs/tags/${VERSION}$" \
      --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
      "${archive}"
    echo "   OK: ${base}"
  else
    echo "   present: ${base}"
  fi
done < <(find . -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.zip' \))

echo ">> Verifying checksum file matches archives"
if [ -f checksums.txt ]; then
  shasum -a 256 -c checksums.txt --ignore-missing
else
  echo "   skipped: no checksums.txt present"
fi

if [ -z "${LOCAL_DIR:-}" ]; then
  echo ">> Verifying docker image signatures"
  for image in \
    "guimadev/clawgard-server:${VERSION}"; do
    cosign verify \
      --certificate-identity-regexp "^https://github\\.com/${REPO}/\\.github/workflows/release\\.yml@refs/tags/${VERSION}$" \
      --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
      "$image" >/dev/null
    echo "   OK: $image"
  done
fi

echo ">> All release artifacts verified for $VERSION"
