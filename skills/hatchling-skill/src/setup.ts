import { Command } from "commander";
import * as p from "@clack/prompts";
import open from "open";
import { initiateDeviceCode, pollForToken } from "./lib/oidc.js";
import { writeConfig, writeToken } from "./lib/config.js";

export interface SetupInput {
  flags: { relayUrl?: string; profile?: string };
  env: NodeJS.ProcessEnv;
}

export async function runSetup(input: SetupInput): Promise<void> {
  p.intro("Clawgard hatchling setup");

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
  writeToken(token.accessToken, input.env);

  p.log.success(`Signed in as ${token.email ?? "(unknown)"}. Saved profile "${profile}".`);
  p.outro("Setup complete.");
}

function buildCli(): Command {
  const cmd = new Command("clawgard-hatchling-setup");
  cmd
    .option("--relay-url <url>", "Relay URL")
    .option("--profile <name>", "Profile name", undefined);
  return cmd;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli().parse(argv);
  const opts = cli.opts<{ relayUrl?: string; profile?: string }>();
  await runSetup({ flags: opts, env: process.env });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
