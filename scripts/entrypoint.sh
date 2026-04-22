#!/bin/sh
set -eu

SERVER_BIN="/usr/local/bin/clawgard-server"

if [ "${1:-}" = "serve" ]; then
  echo "Running database migrations..."
  "$SERVER_BIN" migrate
  echo "Migrations complete."
  echo "Starting server..."
fi

exec "$SERVER_BIN" "$@"
