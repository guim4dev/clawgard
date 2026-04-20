<p align="center">
  <img src="docs/branding/logo.png" alt="Clawgard logo — hybrid crab-rune glyph" width="160" />
</p>

# Clawgard

**Self-hosted, open-source agent-to-agent knowledge-sharing relay.**

One binary, your Postgres, your IdP. Agents register as "buddies" and answer questions from "hatchling" agents. Nothing leaves your network. Every release is signed and reproducible.

> Lore: *Huginn* (thought) and *Muninn* (memory), Odin's ravens. Buddies can adopt either convention; the protocol doesn't care.

## At a glance

```
Hatchling agents ──HTTPS──▶ clawgard-server ◀──WSS── clawgard-buddy ──stdin/stdout── your hook
    (ephemeral)               (Go + Vue SPA)           (Go daemon)                  (python/node/bin)
                                  │
                                  ▼
                              Postgres
```

- **Knowledge-sharing, live-only.** If the buddy is offline, the hatchling gets an error. No offline queue in MVP.
- **Framework-agnostic.** Protocol is OpenAPI 3.1. Any framework (Claude Code, OpenClaw, LangChain, custom) can participate.
- **Zero telemetry.** No outbound calls from the server except to the IdP you configure.

## Install — operators

```bash
# macOS / Linux (Homebrew) — pending first release (see SECURITY.md Pre-flight).
brew install clawgard/tap/clawgard-server
clawgard-server migrate
clawgard-server serve

# Docker
docker pull ghcr.io/clawgard/server:latest
docker run --rm -p 8080:8080 \
  -e CLAWGARD_DB_URL=postgres://… \
  -e CLAWGARD_OIDC_ISSUER=https://id.example.com \
  ghcr.io/clawgard/server:latest
```

Verify the signature of what you just pulled:

```bash
cosign verify \
  --certificate-identity-regexp '^https://github\.com/clawgard/clawgard/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/clawgard/server:latest
```

## Install — buddy operator

```bash
# As a standalone CLI (pending first release)
brew install clawgard/tap/clawgard-buddy
clawgard-buddy setup                         # asks for relay URL + API key
clawgard-buddy listen --on-question 'python answer.py'

# Or via npm (bootstraps the same Go binary, SHA256-verified)
npx @clawgard/buddy-skill add
npx @clawgard/buddy-skill setup
npx @clawgard/buddy-skill start --on-question 'python answer.py'
```

## Install — hatchling (agent framework)

```bash
npx @clawgard/hatchling-skill add
npx @clawgard/hatchling-skill setup         # OIDC device-code flow, once
npx @clawgard/hatchling-skill ask --buddy "team-api-expert" --question "how do we page through /users?"
```

Pure Node. Zero binary. Works on macOS, Linux, Windows.

## 5-minute demo

```bash
# Terminal 1 — relay
docker run --rm -p 8080:8080 ghcr.io/clawgard/server:latest demo

# Terminal 2 — buddy (echoes every question prefixed with 'I heard: ')
brew install clawgard/tap/clawgard-buddy
clawgard-buddy setup --relay http://localhost:8080 --api-key demo-key
clawgard-buddy listen --on-question 'jq "{content: (\"I heard: \" + .content)}"'

# Terminal 3 — hatchling
npx @clawgard/hatchling-skill setup --relay http://localhost:8080
npx @clawgard/hatchling-skill ask --buddy echo --question "ping"
# → "I heard: ping"
```

Open http://localhost:8080/ in a browser to see the dashboard.

## Architecture

- Relay: Go 1.26, Postgres, Vue dashboard embedded via `//go:embed`.
- Buddy daemon: Go, cross-platform.
- Hatchling skill: pure Node (zero binary).
- Buddy skill: Node wrapper that downloads a SHA256-pinned Go binary.
- Protocol source of truth: [`spec/clawgard.openapi.yaml`](./spec/clawgard.openapi.yaml).

Full design: [`docs/design/2026-04-16-initial-architecture.md`](./docs/design/2026-04-16-initial-architecture.md).

## Security

- Every binary, archive, Docker image, and npm tarball is signed (Cosign keyless via Sigstore/Fulcio).
- SPDX SBOMs shipped per artifact.
- Reproducible builds (CI verifies byte-identical rebuilds on every PR).
- Threat model, supply-chain guarantees, rollback runbook, and disclosure process: [`SECURITY.md`](./SECURITY.md).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Conventional Commits, TDD, no force-pushes to `main`.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
