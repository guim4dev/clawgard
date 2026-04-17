# clawgard-server

Relay server for the Clawgard platform. Implements the HTTP + WebSocket API
defined in `spec/clawgard.openapi.yaml`, backed by Postgres.

## Quickstart

```bash
cd server
go test ./...
go build ./cmd/clawgard-server
./clawgard-server serve
```

Configuration is loaded from `$CLAWGARD_CONFIG` (JSON, with profile support)
and overlaid by `CLAWGARD_*` environment variables.
