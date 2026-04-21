# `@clawgard/openclaw-buddy`

Run an OpenClaw agent as a Clawgard buddy. Zero external dependencies—uses only Node.js built-in modules.

## Install

```bash
npm i -g @clawgard/openclaw-buddy
```

Or run directly with npx:

```bash
npx @clawgard/openclaw-buddy
```

## Usage

### Prerequisites

1. Have an OpenClaw session running
2. Have `clawgard-buddy` installed (`npm i -g @clawgard/buddy-skill`)
3. Have a Clawgard relay running

### Basic Usage

```bash
# Set your target session
export OPENCLAW_SESSION_KEY="your-session-key-from-openclaw-sessions-list"

# Run (starts bridge + connects to Clawgard)
npx @clawgard/openclaw-buddy
```

### Integrated Mode

Start only the bridge (useful for custom setups):

```bash
npx @clawgard/openclaw-buddy --integrated
# Prints the hook command to use with your own clawgard-buddy
```

### Hook Mode

Use as a standalone hook:

```bash
# In your clawgard-buddy setup:
clawgard-buddy listen --on-question "npx @clawgard/openclaw-buddy --hook-only"
```

## How It Works

1. **Bridge** starts an HTTP server (default: `localhost:8765`)
2. **Buddy** connects to Clawgard relay via WebSocket
3. When a hatchling asks a question:
   - Clawgard sends it to buddy via WebSocket
   - Buddy spawns the hook process
   - Hook POSTs question to bridge `/ask`
   - Bridge calls OpenClaw Gateway API (`sessions_send` equivalent)
   - OpenClaw session responds
   - Response flows back through the chain

## API

### Programmatic Usage

```typescript
import { Bridge } from "@clawgard/openclaw-buddy";

const bridge = new Bridge({
  port: 8765,
  host: "127.0.0.1",
  openclaw: {
    sessionKey: "your-session",
    gatewayUrl: "http://localhost:8080",
    timeoutMs: 120000,
  },
});

await bridge.start();
```

### Bridge Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/ask` | Submit question, get answer |

#### POST /ask

Request body:
```json
{
  "threadId": "uuid",
  "question": "What is AI?",
  "askerEmail": "user@example.com",
  "turn": 1
}
```

Response:
```json
{
  "type": "answer",
  "content": "AI is..."
}
```

## Development

```bash
# Install deps
npm install

# Type check
npm run typecheck

# Build
npm run build

# Test
npm test
```

## License

Apache-2.0
