import { env, argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import type { ClawgardQuestion, ClawgardAnswer } from "./types.js";

const DEFAULT_BRIDGE_URL = "http://localhost:8765";
const BRIDGE_URL_FLAG = "--bridge-url=";

export function resolveBridgeUrl(args: string[], environment: NodeJS.ProcessEnv = env): string {
  const flag = args.find((a) => a.startsWith(BRIDGE_URL_FLAG));
  if (flag) return flag.slice(BRIDGE_URL_FLAG.length);
  return environment.OPENCLAW_BRIDGE_URL ?? DEFAULT_BRIDGE_URL;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    if (process.stdin.readableEnded) resolve(data);
  });
}

export async function askBridge(
  bridgeUrl: string,
  question: ClawgardQuestion,
): Promise<ClawgardAnswer> {
  const response = await fetch(`${bridgeUrl}/ask`, {
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

export async function runHook(args: string[] = argv.slice(2)): Promise<void> {
  const bridgeUrl = resolveBridgeUrl(args);
  try {
    const input = await readStdin();
    const question = JSON.parse(input) as ClawgardQuestion;
    const answer = await askBridge(bridgeUrl, question);
    console.log(JSON.stringify(answer));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorAnswer: ClawgardAnswer = { type: "close", content: `Hook error: ${message}` };
    console.log(JSON.stringify(errorAnswer));
    exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runHook();
}
