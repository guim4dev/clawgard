#!/usr/bin/env bash
# Dispatches an update event to clawgard/scoop-bucket with the current tag.
# Used as a manual fallback if goreleaser's scoops: step is skipped (e.g. a
# hotfix release re-ran with --skip=scoop).
#
# TODO(remote): writes to the external `clawgard/scoop-bucket` repo. Requires
# a fine-grained PAT with contents: read/write on that repo, exported as
# SCOOP_BUCKET_TOKEN. See SECURITY.md rotation runbook.
set -euo pipefail

VERSION="${1:?usage: update-scoop.sh vX.Y.Z}"
TOKEN="${SCOOP_BUCKET_TOKEN:?SCOOP_BUCKET_TOKEN env var required}"

curl -fsSL -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/clawgard/scoop-bucket/dispatches \
  -d "{\"event_type\":\"clawgard-release\",\"client_payload\":{\"version\":\"${VERSION}\"}}"

echo "Dispatched scoop-bucket update for ${VERSION}"
