import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  listConfiguredAliases,
  missingTokenError,
  resolveConfig,
} from "./lib/config.js";
import { apiFetch, HttpError, humanizeError } from "./lib/http.js";
import type { Buddy } from "./types.js";

export interface ListInput {
  flags: { relayUrl?: string; profile?: string; json?: boolean };
  env: NodeJS.ProcessEnv;
}

export interface ListJsonRow {
  relay: string;
  ref: string;
  id: string;
  name: string;
  description: string;
  ownerEmail: string;
  online: boolean;
}

interface RelaySuccess {
  ok: true;
  alias: string;
  relayUrl: string;
  buddies: Buddy[];
}

interface RelayFailure {
  ok: false;
  alias: string;
  relayUrl?: string;
  errorMessage: string;
}

type RelayResult = RelaySuccess | RelayFailure;

export async function runList(input: ListInput): Promise<void> {
  if (isSingleRelayMode(input)) {
    await runListSingle(input);
    return;
  }

  const aliases = listConfiguredAliases(input.env);
  if (aliases.length === 0) {
    // Delegate to resolveConfig so the user sees the standard setup hint.
    resolveConfig(input);
    return;
  }

  const results = await Promise.all(aliases.map((alias) => fetchRelay(alias, input.env)));

  if (input.flags.json) {
    printJson(results);
  } else {
    printHuman(results);
  }

  if (results.every((r) => !r.ok)) {
    const detail = results
      .map((r) => (r.ok ? "" : `  ${r.alias}: ${r.errorMessage}`))
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `all configured relays failed — run \`clawgard-hatchling-setup\` or check network/auth:\n${detail}`,
    );
  }
}

function isSingleRelayMode(input: ListInput): boolean {
  return Boolean(
    input.flags.profile ||
      input.env.CLAWGARD_PROFILE ||
      input.flags.relayUrl ||
      input.env.CLAWGARD_URL,
  );
}

async function runListSingle(input: ListInput): Promise<void> {
  const cfg = resolveConfig(input);
  if (!cfg.token) throw missingTokenError(cfg.profile);

  const buddies = await apiFetch<Buddy[]>({
    baseUrl: cfg.relayUrl,
    path: "/v1/buddies",
    token: cfg.token,
  });

  const sorted = sortBuddies(buddies);
  const result: RelaySuccess = {
    ok: true,
    alias: cfg.profile,
    relayUrl: cfg.relayUrl,
    buddies: sorted,
  };

  if (input.flags.json) {
    printJson([result]);
  } else {
    printHuman([result]);
  }
}

async function fetchRelay(alias: string, env: NodeJS.ProcessEnv): Promise<RelayResult> {
  let relayUrl: string | undefined;
  try {
    const cfg = resolveConfig({ flags: { profile: alias }, env });
    relayUrl = cfg.relayUrl;
    if (!cfg.token) {
      return {
        ok: false,
        alias,
        relayUrl,
        errorMessage: `no token — run \`clawgard-hatchling-setup --profile ${alias}\``,
      };
    }
    const buddies = await apiFetch<Buddy[]>({
      baseUrl: cfg.relayUrl,
      path: "/v1/buddies",
      token: cfg.token,
    });
    return { ok: true, alias, relayUrl, buddies: sortBuddies(buddies) };
  } catch (err) {
    const errorMessage =
      err instanceof HttpError ? humanizeError(err) : (err as Error).message;
    return { ok: false, alias, relayUrl, errorMessage };
  }
}

function sortBuddies(buddies: Buddy[]): Buddy[] {
  return [...buddies].sort((a, b) => a.name.localeCompare(b.name));
}

function toJsonRow(alias: string, b: Buddy): ListJsonRow {
  return {
    relay: alias,
    ref: `${alias}/${b.name}`,
    id: b.id,
    name: b.name,
    description: b.description,
    ownerEmail: b.ownerEmail,
    online: b.online,
  };
}

function printJson(results: RelayResult[]): void {
  const rows: ListJsonRow[] = [];
  for (const r of results) {
    if (r.ok) {
      for (const b of r.buddies) rows.push(toJsonRow(r.alias, b));
    } else {
      process.stderr.write(`clawgard: relay "${r.alias}" failed: ${r.errorMessage}\n`);
    }
  }
  console.log(JSON.stringify(rows));
}

function printHuman(results: RelayResult[]): void {
  for (const r of results) {
    if (r.ok) {
      printRelaySection(r);
    } else {
      const where = r.relayUrl ? ` (${r.relayUrl})` : "";
      console.log(`ERROR on ${r.alias}${where}: ${r.errorMessage}`);
      console.log("");
    }
  }
}

function printRelaySection(r: RelaySuccess): void {
  console.log(`Buddies on ${r.alias} (${r.relayUrl}):`);
  console.log("");
  if (r.buddies.length === 0) {
    console.log("  (no buddies visible)");
    console.log("");
    return;
  }
  for (const b of r.buddies) {
    const status = b.online ? "online" : "offline";
    console.log(`  ${b.name}  [${status}]`);
    console.log(`    ref:         ${r.alias}/${b.name}`);
    console.log(`    id:          ${b.id}`);
    console.log(`    description: ${b.description}`);
    console.log(`    owner:       ${b.ownerEmail}`);
    console.log("");
  }
}

function buildCli(): Command {
  return new Command("clawgard-hatchling-list")
    .option("--relay-url <url>")
    .option("--profile <name>")
    .option("--json", "emit machine-readable JSON");
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli().parse(argv);
  try {
    await runList({ flags: cli.opts(), env: process.env });
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
