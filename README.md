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
docker pull guimadev/clawgard-server:latest
docker run --rm -p 8080:8080 \
  -e CLAWGARD_DB_URL=postgres://… \
  -e CLAWGARD_OIDC_ISSUER=https://id.example.com \
  guimadev/clawgard-server:latest
```

The image auto-runs `clawgard-server migrate` before starting the server when launched with the default `serve` command. This is convenient for single-replica setups (CapRover, standalone Docker). For HA deployments with multiple replicas, override the command and run migrations as a one-shot job first (`docker run --rm guimadev/clawgard-server:<tag> migrate`), then start `serve` on each replica — running migrations concurrently across replicas can deadlock or partially apply.

Verify the signature of what you just pulled:

```bash
cosign verify \
  --certificate-identity-regexp '^https://github\.com/clawgard/clawgard/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  guimadev/clawgard-server:latest
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
npx @clawgard/hatchling-skill setup                     # OIDC device-code flow, once per relay
npx @clawgard/hatchling-skill ask team-a/api-expert "how do we page through /users?"
```

Pure Node. Zero binary. Works on macOS, Linux, Windows.

### Multi-relay (talk to two companies at once)

A single hatchling can be signed into N relays side-by-side. Register each one with a `--profile <alias>`; each alias keeps an independent OIDC identity and token file. Reference buddies by `<alias>/<name>` — the alias picks the relay.

```bash
npx @clawgard/hatchling-skill setup --profile a --relay-url https://clawgard.a.example
npx @clawgard/hatchling-skill setup --profile b --relay-url https://clawgard.b.example
npx @clawgard/hatchling-skill list                        # merged view across all relays, alias-annotated
npx @clawgard/hatchling-skill ask a/api-expert "..."      # routes to Company A
npx @clawgard/hatchling-skill ask b/data-expert "..."     # routes to Company B
```

### Relay management

```bash
npx @clawgard/hatchling-skill setup --list-relays           # table of {alias, relayUrl, tokenPresent}
npx @clawgard/hatchling-skill setup --remove-relay <alias>  # unregister a relay + delete its token file
```

### Config and token layout

- Linux/macOS: `~/.config/clawgard/`
  - `config.json` — `{ "<alias>": { "relayUrl": "..." } }`
  - `tokens/<alias>.token` — one file per alias, mode `0600`
- Windows: `%APPDATA%\Clawgard\` with the same layout.

Legacy migration: a pre-existing `hatchling.token` file from earlier single-token versions is migrated once to `tokens/default.token` on the next `setup`, `list`, or `ask` invocation, then deleted. A one-line info message is logged; no user action is required.

## 5-minute demo

```bash
# Terminal 1 — relay
docker run --rm -p 8080:8080 guimadev/clawgard-server:latest demo

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
