import envPaths from "env-paths";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, posix, win32 } from "node:path";

function platformJoin(...segments: string[]): string {
  return (process.platform === "win32" ? win32.join : posix.join)(...segments);
}

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

export interface MigrationResult {
  migrated: boolean;
  from?: string;
  to?: string;
}

const SETUP_HINT =
  "run `clawgard-hatchling-setup` first, or set CLAWGARD_URL, or pass --relay-url";

const LEGACY_TOKEN_FILENAME = "hatchling.token";
const TOKENS_DIRNAME = "tokens";

export function configDir(env: NodeJS.ProcessEnv): string {
  const paths = envPaths("clawgard", { suffix: "" });
  if (env.XDG_CONFIG_HOME) return platformJoin(env.XDG_CONFIG_HOME, "clawgard");
  if (process.platform === "win32" && env.APPDATA) return platformJoin(env.APPDATA, "Clawgard");
  if (env.HOME) return platformJoin(env.HOME, ".config", "clawgard");
  return paths.config;
}

export function configFilePath(env: NodeJS.ProcessEnv): string {
  return join(configDir(env), "config.json");
}

export function tokenFilePath(env: NodeJS.ProcessEnv, alias: string): string {
  return join(configDir(env), TOKENS_DIRNAME, `${alias}.token`);
}

export function legacyTokenFilePath(env: NodeJS.ProcessEnv): string {
  return join(configDir(env), LEGACY_TOKEN_FILENAME);
}

function readConfigFile(env: NodeJS.ProcessEnv): ConfigFile | undefined {
  const path = configFilePath(env);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
}

export function listConfiguredAliases(env: NodeJS.ProcessEnv): string[] {
  const file = readConfigFile(env);
  return file ? Object.keys(file).sort() : [];
}

export function readAllProfiles(env: NodeJS.ProcessEnv): ConfigFile {
  return readConfigFile(env) ?? {};
}

export function removeAlias(env: NodeJS.ProcessEnv, alias: string): void {
  const file = readConfigFile(env);
  if (!file || !(alias in file)) {
    throw new Error(
      `alias "${alias}" not found in ${configFilePath(env)}`,
    );
  }
  delete file[alias];
  ensureDir(env);
  writeFile600(configFilePath(env), JSON.stringify(file, null, 2) + "\n");

  const tokenPath = tokenFilePath(env, alias);
  if (existsSync(tokenPath)) unlinkSync(tokenPath);
}

export function readToken(env: NodeJS.ProcessEnv, alias: string): string | undefined {
  const path = tokenFilePath(env, alias);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8").trim();
}

export function migrateLegacyToken(env: NodeJS.ProcessEnv): MigrationResult {
  const legacy = legacyTokenFilePath(env);
  if (!existsSync(legacy)) return { migrated: false };

  const target = tokenFilePath(env, "default");
  if (existsSync(target)) {
    unlinkSync(legacy);
    return { migrated: false };
  }

  const contents = readFileSync(legacy, "utf8");
  ensureTokensDir(env);
  writeFile600(target, contents);
  unlinkSync(legacy);
  return { migrated: true, from: legacy, to: target };
}

export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const profile = input.flags.profile ?? input.env.CLAWGARD_PROFILE ?? "default";

  const mig = migrateLegacyToken(input.env);
  if (mig.migrated) {
    console.error(`clawgard: migrated legacy token file ${mig.from} → ${mig.to}`);
  }

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

  const token = input.env.CLAWGARD_TOKEN ?? readToken(input.env, profile);
  return { relayUrl, profile, token };
}

export function missingTokenError(alias: string): Error {
  return new Error(
    `no token for relay "${alias}" — run \`clawgard-hatchling-setup --profile ${alias}\``,
  );
}

function ensureDir(env: NodeJS.ProcessEnv): string {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function ensureTokensDir(env: NodeJS.ProcessEnv): string {
  const dir = join(configDir(env), TOKENS_DIRNAME);
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

export function writeToken(token: string, env: NodeJS.ProcessEnv, alias: string): void {
  ensureTokensDir(env);
  writeFile600(tokenFilePath(env, alias), token);
}
