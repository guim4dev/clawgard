import { Command } from "commander";
import * as p from "@clack/prompts";
import open from "open";
import { initiateDeviceCode, pollForToken } from "./lib/oidc.js";
import {
  migrateLegacyToken,
  readAllProfiles,
  readToken,
  removeAlias,
  writeConfig,
  writeToken,
} from "./lib/config.js";
import { HttpError, humanizeError } from "./lib/http.js";

export interface SetupInput {
  flags: {
    relayUrl?: string;
    profile?: string;
    listRelays?: boolean;
    removeRelay?: string;
  };
  env: NodeJS.ProcessEnv;
}

export async function runSetup(input: SetupInput): Promise<void> {
  if (input.flags.listRelays) {
    printRelayTable(input.env);
    return;
  }
  if (input.flags.removeRelay !== undefined) {
    runRemoveRelay(input.env, input.flags.removeRelay);
    return;
  }

  p.intro("Clawgard hatchling setup");

  const mig = migrateLegacyToken(input.env);
  if (mig.migrated) {
    p.log.info(`migrated legacy token file ${mig.from} → ${mig.to}`);
  }

  const profile = input.flags.profile ?? input.env.CLAWGARD_PROFILE ?? "default";

  let relayUrl = input.flags.relayUrl ?? input.env.CLAWGARD_URL;
  if (!relayUrl) {
    const answer = await p.text({
      message: "Relay URL (e.g. https://clawgard.acme.internal)",
      validate: (v) => (v && /^https?:\/\//.test(v) ? undefined : "must be an http(s) URL"),
    });
    if (p.isCancel(answer)) { p.outro("cancelled"); return; }
    relayUrl = answer as string;
  }

  p.log.step("Requesting device code…");
  const challenge = await initiateDeviceCode(relayUrl);

  p.note(
    `Open:  ${challenge.verificationUri}\nEnter code:  ${challenge.userCode}`,
    "Sign in",
  );

  const shouldOpen = await p.confirm({ message: "Open the verification page in your browser?" });
  if (!p.isCancel(shouldOpen) && shouldOpen) {
    try { await open(challenge.verificationUriComplete ?? challenge.verificationUri); }
    catch { /* headless; user opens manually */ }
  }

  p.log.step("Waiting for approval…");
  const token = await pollForToken({
    baseUrl: relayUrl,
    deviceCode: challenge.deviceCode,
    intervalSeconds: challenge.interval,
    expiresInSeconds: challenge.expiresIn,
  });

  writeConfig({ relayUrl }, profile, input.env);
  writeToken(token.accessToken, input.env, profile);

  p.log.success(`Signed in as ${token.email ?? "(unknown)"}. Saved profile "${profile}".`);
  p.outro("Setup complete.");
}

function printRelayTable(env: NodeJS.ProcessEnv): void {
  const profiles = readAllProfiles(env);
  const aliases = Object.keys(profiles).sort();

  if (aliases.length === 0) {
    console.log("no relays configured — run `clawgard-hatchling-setup` to add one.");
    return;
  }

  const rows = aliases.map((alias) => ({
    alias,
    relayUrl: profiles[alias].relayUrl,
    tokenPresent: readToken(env, alias) !== undefined ? "yes" : "no",
  }));

  const aliasW = Math.max("ALIAS".length, ...rows.map((r) => r.alias.length));
  const urlW = Math.max("RELAY URL".length, ...rows.map((r) => r.relayUrl.length));

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  console.log(`${pad("ALIAS", aliasW)}  ${pad("RELAY URL", urlW)}  TOKEN`);
  for (const r of rows) {
    console.log(`${pad(r.alias, aliasW)}  ${pad(r.relayUrl, urlW)}  ${r.tokenPresent}`);
  }
}

function runRemoveRelay(env: NodeJS.ProcessEnv, alias: string): void {
  removeAlias(env, alias);
  console.log(`removed relay "${alias}".`);
}

function buildCli(): Command {
  const cmd = new Command("clawgard-hatchling-setup");
  cmd
    .option("--relay-url <url>", "Relay URL")
    .option("--profile <name>", "Profile name", undefined)
    .option("--list-relays", "List configured relays and exit")
    .option("--remove-relay <alias>", "Remove a configured relay alias and its token");
  return cmd;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli().parse(argv);
  const opts = cli.opts<{
    relayUrl?: string;
    profile?: string;
    listRelays?: boolean;
    removeRelay?: string;
  }>();
  try {
    await runSetup({ flags: opts, env: process.env });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
