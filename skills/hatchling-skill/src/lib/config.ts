import envPaths from "env-paths";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

export interface ProfileConfig {
  relayUrl: string;
}

export type ConfigFile = Record<string, ProfileConfig>;

export interface ResolveInput {
  flags: { relayUrl?: string; profile?: string };
  env: NodeJS.ProcessEnv;
}

export interface ResolvedConfig {
  relayUrl: string;
  profile: string;
  token?: string;
}

const SETUP_HINT =
  "run `clawgard-hatchling-setup` first, or set CLAWGARD_URL, or pass --relay-url";

export function configDir(env: NodeJS.ProcessEnv): string {
  const paths = envPaths("clawgard", { suffix: "" });
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "clawgard");
  if (process.platform === "win32" && env.APPDATA) return join(env.APPDATA, "Clawgard");
  if (env.HOME) return join(env.HOME, ".config", "clawgard");
  return paths.config;
}

export function configFilePath(env: NodeJS.ProcessEnv): string {
  return join(configDir(env), "config.json");
}

export function tokenFilePath(env: NodeJS.ProcessEnv): string {
  return join(configDir(env), "hatchling.token");
}

function readConfigFile(env: NodeJS.ProcessEnv): ConfigFile | undefined {
  const path = configFilePath(env);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
}

export function readToken(env: NodeJS.ProcessEnv): string | undefined {
  const path = tokenFilePath(env);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8").trim();
}

export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const profile = input.flags.profile ?? input.env.CLAWGARD_PROFILE ?? "default";
  const file = readConfigFile(input.env);

  let relayUrl: string | undefined = input.flags.relayUrl ?? input.env.CLAWGARD_URL;

  if (!relayUrl && file) {
    if (!(profile in file)) {
      if (input.flags.profile || input.env.CLAWGARD_PROFILE) {
        throw new Error(`profile "${profile}" not found in ${configFilePath(input.env)}`);
      }
    } else {
      relayUrl = file[profile].relayUrl;
    }
  }

  if (!relayUrl) {
    throw new Error(`no relay URL configured — ${SETUP_HINT}`);
  }

  const token = input.env.CLAWGARD_TOKEN ?? readToken(input.env);
  return { relayUrl, profile, token };
}

function ensureDir(env: NodeJS.ProcessEnv): string {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function writeFile600(path: string, data: string): void {
  writeFileSync(path, data, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows: chmod to 0o600 is a no-op on NTFS; ignore.
  }
}

export function writeConfig(
  profileConfig: ProfileConfig,
  profile: string,
  env: NodeJS.ProcessEnv,
): void {
  ensureDir(env);
  const existing = readConfigFile(env) ?? {};
  existing[profile] = profileConfig;
  writeFile600(configFilePath(env), JSON.stringify(existing, null, 2) + "\n");
}

export function writeToken(token: string, env: NodeJS.ProcessEnv): void {
  ensureDir(env);
  writeFile600(tokenFilePath(env), token);
}
