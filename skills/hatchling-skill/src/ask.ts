import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  listConfiguredAliases,
  missingTokenError,
  resolveConfig,
  type ResolvedConfig,
  type ResolveInput,
} from "./lib/config.js";
import { apiFetch, HttpError, humanizeError } from "./lib/http.js";
import type { Buddy, Thread, Message } from "./types.js";

export interface AskInput {
  flags: { relayUrl?: string; profile?: string };
  env: NodeJS.ProcessEnv;
  buddyRef: string;
  question: string;
  /** Injectable for tests; reads a line from stdin when not provided. */
  readReply?: () => Promise<string>;
}

const POLL_WAIT_SECONDS = 25;
const TURN_CAP = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runAsk(input: AskInput): Promise<void> {
  const { cfg, buddyId } = await resolveBuddyTarget(input);

  const base = cfg.relayUrl;
  const token = cfg.token!;

  const opened = await apiFetch<Thread>({
    baseUrl: base,
    path: "/v1/threads",
    method: "POST",
    token,
    body: { buddyId, question: input.question },
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

async function resolveBuddyTarget(
  input: AskInput,
): Promise<{ cfg: ResolvedConfig; buddyId: string }> {
  const ref = input.buddyRef;

  if (UUID_RE.test(ref) || !ref.includes("/")) {
    const cfg = resolveConfig(input);
    if (!cfg.token) throw missingTokenError(cfg.profile);
    return { cfg, buddyId: ref };
  }

  const slash = ref.indexOf("/");
  const alias = ref.slice(0, slash);
  const name = ref.slice(slash + 1);

  const aliases = listConfiguredAliases(input.env);
  if (!aliases.includes(alias)) {
    const list = aliases.length > 0 ? aliases.join(", ") : "(none)";
    throw new Error(
      `unknown relay alias "${alias}" — configured aliases: ${list}. ` +
        `Run \`clawgard-hatchling-setup --profile ${alias}\` to add it.`,
    );
  }

  const scoped: ResolveInput = {
    flags: { ...input.flags, profile: alias },
    env: input.env,
  };
  const cfg = resolveConfig(scoped);
  if (!cfg.token) throw missingTokenError(cfg.profile);

  const buddies = await apiFetch<Buddy[]>({
    baseUrl: cfg.relayUrl,
    path: "/v1/buddies",
    token: cfg.token,
  });
  const matches = buddies.filter((b) => b.name === name);

  if (matches.length === 0) {
    throw new Error(
      `no buddy named "${name}" on relay "${alias}" — ` +
        `run \`clawgard-hatchling-list --profile ${alias}\` to see available buddies.`,
    );
  }
  if (matches.length > 1) {
    const ids = matches.map((b) => b.id).join(", ");
    throw new Error(
      `multiple buddies named "${name}" on relay "${alias}": ${ids}. ` +
        `Pass the UUID directly (e.g. \`clawgard-hatchling-ask <uuid> --profile ${alias}\`).`,
    );
  }

  return { cfg, buddyId: matches[0].id };
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
    .argument("<buddyRef>", "buddy UUID or <alias>/<name>")
    .argument("<question>")
    .option("--relay-url <url>")
    .option("--profile <name>");
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli().parse(argv);
  const [buddyRef, question] = cli.processedArgs as [string, string];
  try {
    await runAsk({ flags: cli.opts(), env: process.env, buddyRef, question });
  } catch (err) {
    if (err instanceof HttpError) {
      process.stderr.write(humanizeError(err) + "\n");
      process.exit(1);
    }
    if (err instanceof Error) {
      process.stderr.write(err.message + "\n");
      process.exit(1);
    }
    throw err;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
