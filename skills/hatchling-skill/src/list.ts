import { Command } from "commander";
import { resolveConfig } from "./lib/config.js";
import { apiFetch } from "./lib/http.js";
import type { Buddy } from "./types.js";

export interface ListInput {
  flags: { relayUrl?: string; profile?: string };
  env: NodeJS.ProcessEnv;
}

export async function runList(input: ListInput): Promise<void> {
  const cfg = resolveConfig(input);
  if (!cfg.token) {
    throw new Error("no token configured — run `clawgard-hatchling-setup`");
  }

  const buddies = await apiFetch<Buddy[]>({
    baseUrl: cfg.relayUrl,
    path: "/v1/buddies",
    token: cfg.token,
  });

  if (buddies.length === 0) {
    console.log("No buddies visible to you on this relay.");
    return;
  }

  console.log(`Buddies on ${cfg.relayUrl}:\n`);
  for (const b of buddies) {
    const status = b.online ? "online" : "offline";
    console.log(`  ${b.name}  [${status}]`);
    console.log(`    id:          ${b.id}`);
    console.log(`    description: ${b.description}`);
    console.log(`    owner:       ${b.ownerEmail}`);
    console.log("");
  }
}

function buildCli(): Command {
  return new Command("clawgard-hatchling-list")
    .option("--relay-url <url>")
    .option("--profile <name>");
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli().parse(argv);
  await runList({ flags: cli.opts(), env: process.env });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
