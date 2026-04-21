/**
 * Hook script for clawgard-buddy integration.
 * Reads question from stdin, calls the bridge HTTP endpoint, writes answer to stdout.
 * 
 * This can be used standalone:
 *   clawgard-buddy listen --on-question "npx @clawgard/openclaw-buddy-hook"
 * 
 * Or the main skill can run it integrated without spawning a separate process.
 */

import { env } from "node:process";
import type { ClawgardQuestion, ClawgardAnswer } from "./types.js";

const BRIDGE_URL = env.OPENCLAW_BRIDGE_URL ?? "http://localhost:8765";

/**
 * Read JSON from stdin.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    
    // Handle case where stdin is already closed
    if (process.stdin.readableEnded) {
      resolve(data);
    }
  });
}

/**
 * Send question to bridge and get answer.
 */
async function askBridge(question: ClawgardQuestion): Promise<ClawgardAnswer> {
  const response = await fetch(`${BRIDGE_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(question),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bridge error ${response.status}: ${text}`);
  }

  return response.json() as Promise<ClawgardAnswer>;
}

/**
 * Main entry point for hook mode.
 */
export async function runHook(): Promise<void> {
  try {
    const input = await readStdin();
    const question = JSON.parse(input) as ClawgardQuestion;
    
    const answer = await askBridge(question);
    
    console.log(JSON.stringify(answer));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorAnswer: ClawgardAnswer = {
      type: "close",
      content: `Hook error: ${message}`,
    };
    console.log(JSON.stringify(errorAnswer));
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHook();
}
