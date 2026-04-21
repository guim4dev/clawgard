/**
 * Main entry point: OpenClaw Buddy skill.
 * 
 * Starts an HTTP bridge and optionally spawns clawgard-buddy to connect to Clawgard.
 * 
 * Usage:
 *   npx @clawgard/openclaw-buddy
 * 
 * Environment:
 *   OPENCLAW_SESSION_KEY    - Target OpenClaw session (required)
 *   OPENCLAW_GATEWAY_URL    - Gateway URL (default: http://localhost:8080)
 *   OPENCLAW_GATEWAY_TOKEN  - Optional auth token
 *   OPENCLAW_BRIDGE_PORT    - Bridge HTTP port (default: 8765)
 *   OPENCLAW_BRIDGE_HOST    - Bridge bind host (default: 127.0.0.1)
 *   OPENCLAW_TIMEOUT_MS     - Request timeout (default: 120000)
 *   CLAWGARD_BUDDY_PATH     - Path to clawgard-buddy binary (default: clawgard-buddy)
 * 
 * Modes:
 *   --integrated    Run bridge only, print hook command to use separately
 *   --hook-only     Run as hook (read stdin, call bridge, write stdout)
 */

import { env, exit, argv } from "node:process";
import { spawn } from "node:child_process";
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
  --hook-only     Run as stdin/stdout hook
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

function getConfig(): BridgeConfig {
  const sessionKey = env.OPENCLAW_SESSION_KEY;
  
  if (!sessionKey) {
    console.error("Error: OPENCLAW_SESSION_KEY is required");
    console.error("Run: openclaw sessions list");
    exit(1);
  }

  return {
    port: parseInt(env.OPENCLAW_BRIDGE_PORT ?? "8765", 10),
    host: env.OPENCLAW_BRIDGE_HOST ?? "127.0.0.1",
    openclaw: {
      sessionKey,
      gatewayUrl: env.OPENCLAW_GATEWAY_URL ?? "http://localhost:8080",
      gatewayToken: env.OPENCLAW_GATEWAY_TOKEN,
      timeoutMs: parseInt(env.OPENCLAW_TIMEOUT_MS ?? "120000", 10),
    },
  };
}

async function runIntegrated(): Promise<void> {
  const config = getConfig();
  const bridge = new Bridge(config);
  
  await bridge.start();
  
  console.log("\n✅ Bridge is running integrated mode");
  console.log(`📡 Bridge URL: http://${config.host}:${config.port}`);
  console.log(`🎯 Session: ${config.openclaw.sessionKey.slice(0, 16)}...`);
  console.log("\nTo connect clawgard-buddy, run:");
  console.log(`  clawgard-buddy listen --on-question "OPENCLAW_BRIDGE_URL=http://${config.host}:${config.port} npx @clawgard/openclaw-buddy --hook-only"`);
  console.log("\nPress Ctrl+C to stop");
  
  // Keep running
  await new Promise(() => {});
}

async function runFull(): Promise<void> {
  const config = getConfig();
  const bridge = new Bridge(config);
  
  await bridge.start();
  
  const buddyPath = env.CLAWGARD_BUDDY_PATH ?? "clawgard-buddy";
  const hookCommand = `OPENCLAW_BRIDGE_URL=http://${config.host}:${config.port} npx @clawgard/openclaw-buddy --hook-only`;
  
  console.log("🚀 Starting OpenClaw Buddy...");
  console.log(`📡 Bridge: http://${config.host}:${config.port}`);
  console.log(`🔌 Buddy: ${buddyPath}`);
  console.log(`🎯 Session: ${config.openclaw.sessionKey.slice(0, 16)}...`);
  console.log("\n--- Buddy logs ---\n");
  
  const buddy = spawn(buddyPath, ["listen", "--on-question", hookCommand], {
    stdio: "inherit",
    shell: true,
  });
  
  buddy.on("error", (err) => {
    console.error("\n❌ Failed to start clawgard-buddy:", err.message);
    console.error("Make sure clawgard-buddy is installed:");
    console.error("  npm i -g @clawgard/buddy-skill");
    bridge.stop();
    exit(1);
  });
  
  buddy.on("exit", (code) => {
    console.log(`\n👋 Buddy exited with code ${code}`);
    bridge.stop();
    exit(code ?? 0);
  });
  
  // Handle Ctrl+C
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
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
    await runHook();
    return;
  }
  
  if (args.includes("--integrated")) {
    await runIntegrated();
    return;
  }
  
  await runFull();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  exit(1);
});
