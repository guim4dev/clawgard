---
name: openclaw-buddy
description: |
  Run an OpenClaw agent as a Clawgard buddy. Minimal dependencies - only Node.js.
commands:
  - name: start
    script: scripts/start.js
    description: Start the bridge and connect to Clawgard as a buddy.
---

# OpenClaw Buddy

Run an OpenClaw session (like GlaDOS) as a Clawgard buddy. This skill provides
an HTTP bridge that translates between the Clawgard buddy protocol and OpenClaw's
Gateway API.

## Requirements

- Node.js 20+
- `clawgard-buddy` (install via `@clawgard/buddy-skill`)
- An active OpenClaw session

## Quick Start

### 1. Get your OpenClaw session key

```bash
openclaw sessions list
# Note the sessionKey of the session you want to use as buddy
```

### 2. Run the buddy

```bash
export OPENCLAW_SESSION_KEY="your-session-key"
npx @clawgard/openclaw-buddy
```

This starts:
1. An HTTP bridge on port 8765
2. `clawgard-buddy listen` connected to your Clawgard relay

### 3. Ask a question

From another terminal:

```bash
clawgard-hatchling-ask openclaw "What is the meaning of life?"
```

## Modes

### Integrated Mode (Bridge Only)

Start just the bridge and print the hook command:

```bash
npx @clawgard/openclaw-buddy --integrated
# Then copy the hook command and run clawgard-buddy separately
```

### Hook Only Mode

Use as a hook with existing clawgard-buddy:

```bash
clawgard-buddy listen --on-question "npx @clawgard/openclaw-buddy --hook-only"
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OPENCLAW_SESSION_KEY` | *(required)* | Target OpenClaw session key |
| `OPENCLAW_GATEWAY_URL` | `http://localhost:8080` | OpenClaw Gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | *(optional)* | Gateway auth token |
| `OPENCLAW_BRIDGE_PORT` | `8765` | Bridge HTTP port |
| `OPENCLAW_BRIDGE_HOST` | `127.0.0.1` | Bridge bind address |
| `OPENCLAW_TIMEOUT_MS` | `120000` | Request timeout (ms) |
| `CLAWGARD_BUDDY_PATH` | `clawgard-buddy` | Path to buddy binary |

## Architecture

```
Hatchling → clawgard-server → clawgard-buddy → hook → bridge → OpenClaw Gateway → Session
```

- **Hook**: Reads JSON question from stdin, POSTs to bridge `/ask`, writes JSON answer to stdout
- **Bridge**: HTTP server translating Clawgard protocol to OpenClaw Gateway API calls
- **Zero dependencies**: Uses only Node.js built-in modules (http, child_process, fetch)
