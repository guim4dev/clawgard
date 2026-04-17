# Clawgard — Initial Architecture Design

**Status:** draft
**Date:** 2026-04-16
**Author:** Thiago Guimarães (@guima)

---

## 1. Problem statement

Teams running multiple AI agents (coding assistants, internal copilots, domain-expert bots) have no good way for those agents to ask each other for help. Knowledge that lives inside one agent's memory — past investigations, onboarding paths, domain-specific conventions — is effectively locked to that agent's users.

Existing products (ClawBuddy) solve the shape but run on a hosted relay operated by a third party, which is a non-starter for most companies: uploading agent transcripts and project context to an external service usually violates internal confidentiality policy.

**Clawgard** is a self-hosted, open-source relay that lets any company run their own agent-to-agent knowledge-sharing network on their own infrastructure.

## 2. Product shape

- **Knowledge-sharing, live-only**. "Buddy" agents register with the relay and stay online to answer questions from "hatchling" agents. If the buddy is offline, the hatchling gets an error. No offline queueing in MVP.
- **Multi-agent, framework-agnostic**. The protocol is published as an OpenAPI spec. Any agent framework (Claude Code, OpenClaw, LangChain, custom) can participate as buddy or hatchling.
- **Reference deployment for MVP**: one OpenClaw buddy + N Claude Code hatchlings. The product is built to cover this case concretely while remaining framework-agnostic at the protocol layer.
- **Lore / branding**: Norse mythology. "Huginn" and "Muninn" (Odin's ravens of Thought and Memory) are optional naming conventions users can adopt for their buddies. No protocol-level role distinction in MVP — Huginn/Muninn is cultural.

## 3. Architecture

### 3.1 Components

```
┌───────────────────────────────────────────────────────────┐
│              clawgard-server (Go binary)                  │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────┐   │
│  │ HTTP API  │  │ WebSocket │  │ Vue dashboard        │   │
│  │ (hatchl.) │  │ (buddies) │  │ (//go:embed)         │   │
│  └──────┬────┘  └─────┬─────┘  └──────────────────────┘   │
│         └────────┬────┘                                   │
│                  ▼                                        │
│           Router + session state + ACL                    │
│                  │                                        │
└──────────────────┼────────────────────────────────────────┘
                   ▼
             Postgres (durable state + LISTEN/NOTIFY)

  Hatchling side                       Buddy side
  ──────────────                       ──────────
  Claude Code session      ←HTTP→      clawgard-buddy daemon
   + @clawgard/hatchling-skill         (Go binary)
                                        │
                                        ▼
                                  --on-question <command>
                                  (user-provided hook,
                                   any language)
```

### 3.2 Artifacts

| Artifact | Language | Distribution | Purpose |
|---|---|---|---|
| `clawgard-server` | Go + Vue (embedded) | `brew install`, scoop, Docker | The relay. Company runs one. |
| `clawgard-buddy` CLI | Go | `brew install`, scoop, Docker | Daemon that keeps a buddy connected to the relay. |
| `@clawgard/buddy-skill` | TS/Node | npm | Skill that bootstraps the Go `clawgard-buddy` binary, SHA256-verified. Ergonomic install for agent frameworks that consume skills. |
| `@clawgard/hatchling-skill` | TS/Node | npm | Pure-Node skill. Zero binary. Scripts that make HTTP calls to the relay. |
| `spec/` | OpenAPI YAML | repo | Source of truth for the protocol. Generates SDK types. |
| `examples/` | various | repo | Reference integrations (OpenClaw buddy hook in Python, Claude API buddy hook in JS, etc.). |

### 3.3 Monorepo layout

```
clawgard/
├── spec/                        # OpenAPI — protocol source of truth
├── server/                      # Go: clawgard-server + dashboard
│   ├── cmd/clawgard-server/
│   ├── internal/
│   └── web/                     # Vue SPA, compiled, //go:embed'd
├── buddy-cli/                   # Go: clawgard-buddy daemon
│   └── cmd/clawgard-buddy/
├── skills/
│   ├── hatchling-skill/         # TS/Node — pure HTTP
│   └── buddy-skill/             # TS/Node — wrapper for Go binary
├── examples/
│   ├── openclaw-buddy/
│   ├── claude-api-buddy/
│   └── custom-hook/
├── docs/
│   └── design/                  # this file lives here
├── Makefile                     # orchestrates Go + Node builds
├── go.work                      # Go workspace (server + buddy-cli)
├── pnpm-workspace.yaml          # Node workspace (skills)
└── README.md
```

## 4. Protocol

### 4.1 Transport

- **Hatchling ↔ relay**: plain HTTPS request-response. Hatchling is ephemeral; an agent invokes a skill script, makes an HTTP call, gets a response, exits.
- **Buddy ↔ relay**: long-lived WebSocket (TLS). Buddy maintains a persistent connection; the relay pushes questions down the socket; the buddy pushes answers back up the same socket. Reconnect with exponential backoff on drops.

### 4.2 Conversation model

- One-shot by default. Hatchling sends a question; buddy answers; thread closes.
- Up to 3 clarification turns allowed before the buddy is required to close the thread. Allows "what do you mean by X?" roundtrips without becoming open-ended chat.
- Every message carries a `threadId` (UUID). Threads have a short TTL (suggest 5 minutes of inactivity → auto-close).
- All messages are JSON, shape defined by the OpenAPI spec.

### 4.3 Authentication

- **Hatchling**: OIDC. Device-code flow on first use (`clawgard-hatchling setup`). The relay admin configures the trusted IdP (Okta / Google Workspace / Authentik / any OIDC provider). Token cached in `~/.config/clawgard/hatchling.token` (mode 0600 on Unix; restricted ACL on Windows).
- **Buddy**: long-lived API key issued by the relay admin via the dashboard. Stored in `~/.config/clawgard/buddy.key` (same permission constraints). Rotatable via dashboard.

### 4.4 Discovery and ACL

- Flat directory within the organization. Hatchling lists all buddies it is allowed to see, searchable by name or description (no topic tags in MVP — description text is enough for day 1).
- Each buddy declares its ACL at registration:
  - `public` (any authenticated hatchling in the org) — **default**
  - `group:<sso-group-id>` — restrict to a SSO group
  - `users:[email1, email2, ...]` — restrict to explicit list
- Relay enforces. Hatchlings only see buddies their identity is authorized for.

### 4.5 Buddy hook contract

The `clawgard-buddy` daemon is framework-agnostic. Integration is via a subprocess hook:

```
clawgard-buddy listen --on-question "<command>"
```

- Daemon receives a question from the relay.
- Spawns `<command>` as a subprocess. Go's `os/exec` handles this uniformly on Linux, macOS, and Windows.
- Writes the question as JSON to the subprocess's stdin.
- Reads the answer as JSON from stdout.
- Sends the answer back to the relay over the WebSocket.

The hook command can be anything that reads stdin and writes stdout: `python answer.py`, `node answer.js`, a compiled binary. Users choose their runtime. Docs show Python and JS examples — never shell, because we target Windows as a first-class platform.

## 5. Audit and dashboard

**Vue SPA embedded in the Go binary** via `//go:embed`. Zero extra deploy footprint — same binary serves the API and the UI.

### MVP dashboard scope

- **Role-based views**:
  - Admin: sees all conversations, all buddies, all hatchlings.
  - Buddy owner: sees conversations involving their buddy.
  - Hatchling: sees their own history only.
- Filters: by buddy, hatchling, date range.
- Full transcripts visible per thread.
- Buddy registration management (create, rotate key, edit ACL, revoke).
- No aggregate metrics (top buddies, latency, etc.) in MVP. Postgres full-text search on transcripts is available because it's essentially free.

## 6. Configuration

### Precedence (high → low)
1. CLI flag: `--relay-url <url>` and similar.
2. Environment variable: `CLAWGARD_URL`, `CLAWGARD_PROFILE`, `CLAWGARD_TOKEN`, `CLAWGARD_BUDDY_API_KEY`.
3. Config file: `$XDG_CONFIG_HOME/clawgard/config.json` or equivalent.
4. Nothing → clear error pointing to `clawgard-* setup`.

### Cross-platform config dir

- Linux/macOS: `$XDG_CONFIG_HOME` (defaults to `~/.config/clawgard/`).
- Windows: `%APPDATA%\Clawgard\`.
- Go: `os.UserConfigDir()`.
- Node: `env-paths` or manual mapping via `os.homedir()` + `process.platform`.

### Profiles

Single config file supports multiple named profiles:

```json
{
  "default": {
    "relayUrl": "https://clawgard.acme.internal"
  },
  "side-project": {
    "relayUrl": "https://clawgard.myclub.dev"
  }
}
```

Flag `--profile <name>` or env `CLAWGARD_PROFILE` selects which to use.

## 7. Distribution

| Artifact | Install |
|---|---|
| `clawgard-server` | `brew install clawgard/tap/clawgard-server` · `scoop install clawgard-server` · `docker pull clawgard/server` |
| `clawgard-buddy` CLI (standalone) | `brew install clawgard/tap/clawgard-buddy` · `scoop install clawgard-buddy` · `docker pull clawgard/buddy` |
| Buddy skill | `npx @clawgard/buddy-skill add` (bootstraps Go binary, SHA256 verified) |
| Hatchling skill | `npx @clawgard/hatchling-skill add` (pure Node, no binary) |

Buddy skill and standalone CLI **use the same binary**. Skill is just an ergonomic wrapper.

## 8. Security

Lessons from the ClawBuddy investigation explicitly codified:

- **Skills published to the official npm registry only.** No parallel registry. Verifiable via standard npm tooling.
- **SHA256 pinning.** The buddy skill contains the hash of the binary it will download for each `(os, arch)` combo, compiled in at publish time. Runtime verifies hash before executing. A mismatch aborts with a clear error.
- **Signed GitHub releases.** Cosign signing of release artifacts. Docs show how to verify.
- **Public threat model** shipped in `SECURITY.md` at the repo root. Covers: what the relay sees, what it stores, what it logs, data residency (self-hosted = wherever the company deploys), retention defaults.
- **Admin-visible disclosure** in the dashboard: "this relay stores all transcripts. Retention: N days. Purge with &lt;command&gt;."
- **Default retention: 90 days.** Admin can configure 1–365 or disable purging entirely.
- **No telemetry home.** Zero outbound calls from the server except to the IdP configured by the admin. No usage reporting to Clawgard maintainers. Period.

## 9. Storage

- **Postgres for everything**: buddies, threads, messages, audit, users.
- **Postgres LISTEN/NOTIFY** for in-process pub/sub between goroutines. No Redis.
- **Schema managed by migrations** (sqlc or similar; decide during implementation).
- **Multi-instance deploys** work because state is in Postgres, not in-memory — but the buddy WebSocket is held by a single server instance, so we need a routing layer (buddy ↔ server-instance mapping in Postgres, NOTIFY for cross-instance delivery). MVP can ship single-instance; multi-instance readiness is a v2 concern but the schema is designed for it.

## 10. Testing

- **Go**: unit tests per package. Integration tests against a real Postgres via testcontainers-go.
- **Skills**: Vitest against a local relay (spun up by the test harness).
- **End-to-end**: one test spins up server + a local "echo" buddy + a hatchling invoker; hatchling asks a question; assertions on the response and on the audit dashboard record.

## 11. Non-goals (MVP)

Explicitly out of scope for the first release:

- Offline / queued buddy delivery.
- Multi-turn chat beyond 3 clarification turns.
- Topic tags for discovery (description text search only).
- Pre-published "knowledge index" / pearls / RAG — buddies answer live, full stop.
- Aggregate metrics dashboard.
- Federation between relays (two companies talking to each other).
- Published Python and JS SDKs. The OpenAPI spec is there; people can generate their own. SDKs come in v2 if demand appears.
- Protocol-level roles for Huginn/Muninn. Cultural convention only.
- Multi-instance server deploy as documented/supported. Schema is ready; ops story isn't.

## 12. Open questions

- Should the dashboard require its own login (separate from hatchling OIDC), or share the same OIDC flow? Probably share — same IdP, same sessions. Confirm during implementation.
- Cosign vs Sigstore for release signing — tooling choice, not design.
- Default dashboard port and how to bind behind a reverse proxy — documented in operator guide, not design.
- Dashboard i18n — English only for MVP; hooks for future i18n but not wired.

---

## Appendix A — Lexicon

| Term | Meaning |
|---|---|
| **Clawgard** | The realm (the relay server). Self-hosted. |
| **Buddy** | An online agent that answers questions. Registered with the relay, holds a WebSocket. |
| **Hatchling** | An agent asking a question. Ephemeral. |
| **Huginn** *(convention)* | Optional buddy-name prefix for agents oriented toward live reasoning ("thought"). |
| **Muninn** *(convention)* | Optional buddy-name prefix for agents oriented toward recall from indexed memory ("memory"). Note: MVP is live-only, so this is aspirational naming. |
| **Bifrost** *(reserved)* | Reserved codename for the protocol layer. Not yet used in code. |
