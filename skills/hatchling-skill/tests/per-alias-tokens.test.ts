import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import {
  legacyTokenFilePath,
  migrateLegacyToken,
  missingTokenError,
  readToken,
  resolveConfig,
  tokenFilePath,
  writeConfig,
  writeToken,
} from "../src/lib/config.js";

let sb: Sandbox;

beforeEach(() => { sb = makeSandbox(); });
afterEach(() => { sb.cleanup(); vi.restoreAllMocks(); });

describe("per-alias token storage", () => {
  it("tokenFilePath is a function of the alias", () => {
    const env = sb.withEnv();
    const a = tokenFilePath(env, "default");
    const b = tokenFilePath(env, "staging");
    expect(a).not.toBe(b);
    expect(a.endsWith("default.token")).toBe(true);
    expect(b.endsWith("staging.token")).toBe(true);
  });

  it("writeToken writes to the per-alias path with mode 0600", () => {
    const env = sb.withEnv();
    writeToken("abc", env, "staging");
    const path = tokenFilePath(env, "staging");
    expect(readFileSync(path, "utf8").trim()).toBe("abc");
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("writing a second alias's token does NOT overwrite the first", () => {
    const env = sb.withEnv();
    writeToken("token-A", env, "default");
    writeToken("token-B", env, "staging");
    expect(readToken(env, "default")).toBe("token-A");
    expect(readToken(env, "staging")).toBe("token-B");
  });

  it("readToken returns undefined when alias has no token yet", () => {
    const env = sb.withEnv();
    expect(readToken(env, "default")).toBeUndefined();
  });
});

describe("legacy hatchling.token migration", () => {
  function seedLegacyToken(env: NodeJS.ProcessEnv, value: string): string {
    const dir = join(sb.xdgConfigHome, "clawgard");
    mkdirSync(dir, { recursive: true });
    const path = legacyTokenFilePath(env);
    writeFileSync(path, value, { mode: 0o600 });
    return path;
  }

  it("moves hatchling.token to tokens/default.token on first call", () => {
    const env = sb.withEnv();
    const legacy = seedLegacyToken(env, "legacy-token\n");

    const result = migrateLegacyToken(env);

    expect(result.migrated).toBe(true);
    expect(result.from).toBe(legacy);
    expect(result.to).toBe(tokenFilePath(env, "default"));
    expect(existsSync(legacy)).toBe(false);
    expect(readToken(env, "default")).toBe("legacy-token");
  });

  it("is idempotent: second call does nothing", () => {
    const env = sb.withEnv();
    seedLegacyToken(env, "legacy-token");

    const first = migrateLegacyToken(env);
    const second = migrateLegacyToken(env);

    expect(first.migrated).toBe(true);
    expect(second.migrated).toBe(false);
    expect(readToken(env, "default")).toBe("legacy-token");
  });

  it("does nothing when no legacy token file exists", () => {
    const env = sb.withEnv();
    const result = migrateLegacyToken(env);
    expect(result.migrated).toBe(false);
  });

  it("leaves the per-alias file untouched if it already has content", () => {
    const env = sb.withEnv();
    writeToken("new-token", env, "default");
    seedLegacyToken(env, "legacy-token");

    const result = migrateLegacyToken(env);

    expect(result.migrated).toBe(false);
    expect(readToken(env, "default")).toBe("new-token");
    expect(existsSync(legacyTokenFilePath(env))).toBe(false);
  });

  it("resolveConfig triggers migration on first call and logs once at info", () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://r" }, "default", env);
    seedLegacyToken(env, "legacy-token");

    const info = vi.spyOn(console, "error").mockImplementation(() => {});

    const cfg1 = resolveConfig({ flags: {}, env });
    const cfg2 = resolveConfig({ flags: {}, env });

    expect(cfg1.token).toBe("legacy-token");
    expect(cfg2.token).toBe("legacy-token");
    const migrationLogs = info.mock.calls.filter((call) =>
      String(call[0]).includes("migrated"),
    );
    expect(migrationLogs).toHaveLength(1);
  });
});

describe("resolveConfig — per-alias token scoping", () => {
  it("returns the token scoped to the resolved alias", () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://a" }, "default", env);
    writeConfig({ relayUrl: "https://b" }, "staging", env);
    writeToken("tok-default", env, "default");
    writeToken("tok-staging", env, "staging");

    const cfgDefault = resolveConfig({ flags: {}, env });
    const cfgStaging = resolveConfig({ flags: { profile: "staging" }, env });

    expect(cfgDefault.token).toBe("tok-default");
    expect(cfgStaging.token).toBe("tok-staging");
  });

  it("resolveConfig yields an undefined token for an alias with no file", () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://a" }, "default", env);
    writeConfig({ relayUrl: "https://b" }, "staging", env);
    writeToken("tok-default", env, "default");

    const cfg = resolveConfig({ flags: { profile: "staging" }, env });
    expect(cfg.token).toBeUndefined();
    expect(cfg.profile).toBe("staging");
  });

  it("missingTokenError names the specific alias and mentions setup", () => {
    const err = missingTokenError("staging");
    expect(err.message).toContain("staging");
    expect(err.message).toMatch(/setup/i);
    expect(err.message).toContain("--profile staging");
  });

  it("CLAWGARD_TOKEN env override wins over any per-alias token file", () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://a" }, "default", env);
    writeToken("file-token", env, "default");
    const withOverride = sb.withEnv({ CLAWGARD_TOKEN: "env-token" });

    const cfg = resolveConfig({ flags: {}, env: withOverride });

    expect(cfg.token).toBe("env-token");
  });

  it("CLAWGARD_TOKEN override works even when the alias has no file token", () => {
    const env = sb.withEnv({
      CLAWGARD_URL: "https://r",
      CLAWGARD_TOKEN: "env-token",
    });
    const cfg = resolveConfig({ flags: {}, env });
    expect(cfg.token).toBe("env-token");
  });
});
