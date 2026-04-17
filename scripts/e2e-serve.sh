#!/usr/bin/env bash
# E2E harness: builds the dashboard, builds the server, and starts it with
# the mock IdP enabled so Playwright can exercise the full embedded surface.
# Usage: e2e-serve.sh [PORT]
set -euo pipefail
PORT="${1:-18080}"

cd "$(dirname "$0")/.."
pnpm --filter @clawgard/dashboard build
cd server
go build -o /tmp/clawgard-server-e2e ./cmd/clawgard-server
export CLAWGARD_PORT="${PORT}"
export CLAWGARD_ENV=dev
export CLAWGARD_SESSION_SECRET="${CLAWGARD_SESSION_SECRET:-test-secret-32-bytes-xxxxxxxxxxxx}"
export CLAWGARD_IDP_MODE=mock
export CLAWGARD_ADMIN_EMAILS="${CLAWGARD_ADMIN_EMAILS:-admin@clawgard.test}"
export CLAWGARD_DB_URL="${CLAWGARD_DB_URL:-postgres://clawgard:clawgard@localhost:5433/clawgard_e2e?sslmode=disable}"
exec /tmp/clawgard-server-e2e serve
