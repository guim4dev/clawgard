import { env, exit, argv } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Bridge } from "./bridge.js";
import { runHook } from "./hook.js";
import type { BridgeConfig } from "./types.js";

function showHelp(): void {
  console.log(`
OpenClaw Buddy - Run an OpenClaw agent as a Clawgard buddy

Usage:
  npx @clawgard/openclaw-buddy [options]

Options:
  --integrated    Start bridge only, print hook command
  --hook-only     Run as stdin/stdout hook (accepts --bridge-url=<url>)
  --help          Show this help

Environment:
  OPENCLAW_SESSION_KEY      Target OpenClaw session (required)
  OPENCLAW_GATEWAY_URL      Gateway URL (default: http://localhost:8080)
  OPENCLAW_GATEWAY_TOKEN    Optional auth token
  OPENCLAW_BRIDGE_PORT      Bridge port (default: 8765)
  OPENCLAW_BRIDGE_HOST      Bridge host (default: 127.0.0.1)
  OPENCLAW_TIMEOUT_MS       Timeout ms (default: 120000)
  CLAWGARD_BUDDY_PATH       Path to buddy binary (default: clawgard-buddy)

Examples:
  # Full mode: bridge + buddy daemon
  OPENCLAW_SESSION_KEY=abc123 npx @clawgard/openclaw-buddy

  # Bridge only (print hook command)
  OPENCLAW_SESSION_KEY=abc123 npx @clawgard/openclaw-buddy --integrated

  # Hook only (for use with --on-question)
  echo '{"threadId":"...","question":"..."}' | npx @clawgard/openclaw-buddy --hook-only
`);
}

export function getConfig(environment: NodeJS.ProcessEnv = env): BridgeConfig {
  const sessionKey = environment.OPENCLAW_SESSION_KEY;

  if (!sessionKey) {
    console.error("Error: OPENCLAW_SESSION_KEY is required");
    console.error("Run: openclaw sessions list");
    exit(1);
  }

  return {
    port: parseInt(environment.OPENCLAW_BRIDGE_PORT ?? "8765", 10),
    host: environment.OPENCLAW_BRIDGE_HOST ?? "127.0.0.1",
    openclaw: {
      sessionKey,
      gatewayUrl: environment.OPENCLAW_GATEWAY_URL ?? "http://localhost:8080",
      gatewayToken: environment.OPENCLAW_GATEWAY_TOKEN,
      timeoutMs: parseInt(environment.OPENCLAW_TIMEOUT_MS ?? "120000", 10),
    },
  };
}

export function buildHookCommand(host: string, port: number): string {
  // --bridge-url is cross-shell; env-var prefixes break on Windows cmd.exe.
  return `npx @clawgard/openclaw-buddy --hook-only --bridge-url=http://${host}:${port}`;
}

async function runIntegrated(): Promise<void> {
  const config = getConfig();
  const bridge = new Bridge(config);

  await bridge.start();

  const hookCommand = buildHookCommand(config.host, config.port);
  console.log(`Bridge listening on http://${config.host}:${config.port}`);
  console.log(`Session: ${config.openclaw.sessionKey.slice(0, 8)}...`);
  console.log("\nTo connect clawgard-buddy, run:");
  console.log(`  clawgard-buddy listen --on-question "${hookCommand}"`);
  console.log("\nPress Ctrl+C to stop");

  process.on("SIGINT", () => {
    bridge.stop().finally(() => exit(0));
  });

  await new Promise(() => {});
}

async function runFull(): Promise<void> {
  const config = getConfig();
  const bridge = new Bridge(config);

  await bridge.start();

  const buddyPath = env.CLAWGARD_BUDDY_PATH ?? "clawgard-buddy";
  const hookCommand = buildHookCommand(config.host, config.port);

  console.log(`Bridge: http://${config.host}:${config.port}`);
  console.log(`Buddy:  ${buddyPath}`);
  console.log(`Session: ${config.openclaw.sessionKey.slice(0, 8)}...`);
  console.log("\n--- buddy logs ---\n");

  const buddy = spawn(buddyPath, ["listen", "--on-question", hookCommand], {
    stdio: "inherit",
    shell: true,
  });

  buddy.on("error", async (err) => {
    console.error("\nFailed to start clawgard-buddy:", err.message);
    console.error("Make sure clawgard-buddy is installed:");
    console.error("  npm i -g @clawgard/buddy-skill");
    await bridge.stop().catch(() => {});
    exit(1);
  });

  buddy.on("exit", async (code) => {
    console.log(`\nBuddy exited with code ${code}`);
    await bridge.stop().catch(() => {});
    exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    buddy.kill("SIGTERM");
  });
}

async function main(): Promise<void> {
  const args = argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    exit(0);
  }

  if (args.includes("--hook-only")) {
    await runHook(args);
    return;
  }

  if (args.includes("--integrated")) {
    await runIntegrated();
    return;
  }

  await runFull();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    exit(1);
  });
}
