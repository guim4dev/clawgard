import { Command } from "commander";
import { missingTokenError, resolveConfig } from "./lib/config.js";
import { apiFetch, HttpError, humanizeError } from "./lib/http.js";
import type { Thread, Message } from "./types.js";

export interface AskInput {
  flags: { relayUrl?: string; profile?: string };
  env: NodeJS.ProcessEnv;
  buddyId: string;
  question: string;
  /** Injectable for tests; reads a line from stdin when not provided. */
  readReply?: () => Promise<string>;
}

const POLL_WAIT_SECONDS = 25;
const TURN_CAP = 3;

export async function runAsk(input: AskInput): Promise<void> {
  const cfg = resolveConfig(input);
  if (!cfg.token) throw missingTokenError(cfg.profile);

  const base = cfg.relayUrl;
  const token = cfg.token;

  const opened = await apiFetch<Thread>({
    baseUrl: base,
    path: "/v1/threads",
    method: "POST",
    token,
    body: { buddyId: input.buddyId, question: input.question },
  });

  let threadId = opened.id;
  let hatchlingTurnsUsed = 0;
  let lastPrintedId: string | undefined;

  while (true) {
    const thread = await apiFetch<Thread>({
      baseUrl: base,
      path: `/v1/threads/${threadId}?waitSeconds=${POLL_WAIT_SECONDS}`,
      token,
      timeoutMs: (POLL_WAIT_SECONDS + 5) * 1000,
    });

    for (const m of thread.messages) {
      if (m.role === "buddy" && m.id !== lastPrintedId) {
        printBuddyMessage(m);
        lastPrintedId = m.id;
      }
    }

    if (thread.status === "closed") return;

    const pending = thread.messages.filter(
      (m) => m.role === "buddy" && m.type === "clarification_request",
    );
    const latestPending = pending.at(-1);
    const askedAfterLastReply =
      latestPending && thread.messages.findIndex(
        (m) => m.role === "hatchling" && m.type === "clarification" && m.createdAt > latestPending.createdAt,
      ) === -1;

    if (!latestPending || !askedAfterLastReply) {
      continue;
    }

    if (hatchlingTurnsUsed >= TURN_CAP) {
      console.log("(turn cap of 3 reached — waiting for the buddy to close the thread)");
      continue;
    }

    const reply = input.readReply ? await input.readReply() : await readLineFromStdin();
    hatchlingTurnsUsed++;

    await apiFetch({
      baseUrl: base,
      path: `/v1/threads/${threadId}/messages`,
      method: "POST",
      token,
      body: { content: reply },
    });
  }
}

function printBuddyMessage(m: Message): void {
  const prefix = m.type === "clarification_request" ? "Buddy asks" : "Buddy";
  console.log(`${prefix}: ${m.content}`);
}

async function readLineFromStdin(): Promise<string> {
  if (process.stdin.isTTY) process.stdout.write("Your reply: ");
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        cleanup();
        resolve(buf.slice(0, nl).trim());
      }
    };
    const onEnd = () => { cleanup(); resolve(buf.trim()); };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
  });
}

function buildCli(): Command {
  return new Command("clawgard-hatchling-ask")
    .argument("<buddyId>")
    .argument("<question>")
    .option("--relay-url <url>")
    .option("--profile <name>");
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli().parse(argv);
  const [buddyId, question] = cli.processedArgs as [string, string];
  try {
    await runAsk({ flags: cli.opts(), env: process.env, buddyId, question });
  } catch (err) {
    if (err instanceof HttpError) {
      process.stderr.write(humanizeError(err) + "\n");
      process.exit(1);
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
