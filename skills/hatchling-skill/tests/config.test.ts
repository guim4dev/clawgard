import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import { resolveConfig, writeConfig, writeToken, readToken } from "../src/lib/config.js";

let sb: Sandbox;

beforeEach(() => { sb = makeSandbox(); });
afterEach(() => { sb.cleanup(); });

function writeConfigFile(profiles: Record<string, { relayUrl: string }>): string {
  const dir = join(sb.xdgConfigHome, "clawgard");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify(profiles), { mode: 0o600 });
  return path;
}

describe("resolveConfig — precedence", () => {
  it("CLI flag wins over env and file", () => {
    writeConfigFile({ default: { relayUrl: "https://from-file" } });
    const env = sb.withEnv({ CLAWGARD_URL: "https://from-env" });
    const cfg = resolveConfig({ flags: { relayUrl: "https://from-flag" }, env });
    expect(cfg.relayUrl).toBe("https://from-flag");
  });

  it("env wins over file when no flag", () => {
    writeConfigFile({ default: { relayUrl: "https://from-file" } });
    const env = sb.withEnv({ CLAWGARD_URL: "https://from-env" });
    const cfg = resolveConfig({ flags: {}, env });
    expect(cfg.relayUrl).toBe("https://from-env");
  });

  it("file wins when no flag and no env", () => {
    writeConfigFile({ default: { relayUrl: "https://from-file" } });
    const env = sb.withEnv();
    const cfg = resolveConfig({ flags: {}, env });
    expect(cfg.relayUrl).toBe("https://from-file");
  });

  it("throws a setup-directing error when nothing is configured", () => {
    const env = sb.withEnv();
    expect(() => resolveConfig({ flags: {}, env })).toThrow(/clawgard-hatchling-setup/);
  });

  it("CLI --profile selects a named profile", () => {
    writeConfigFile({
      default: { relayUrl: "https://default" },
      staging: { relayUrl: "https://staging" },
    });
    const env = sb.withEnv();
    const cfg = resolveConfig({ flags: { profile: "staging" }, env });
    expect(cfg.relayUrl).toBe("https://staging");
  });

  it("CLAWGARD_PROFILE env selects a named profile", () => {
    writeConfigFile({
      default: { relayUrl: "https://default" },
      staging: { relayUrl: "https://staging" },
    });
    const env = sb.withEnv({ CLAWGARD_PROFILE: "staging" });
    const cfg = resolveConfig({ flags: {}, env });
    expect(cfg.relayUrl).toBe("https://staging");
  });

  it("unknown profile throws a clear error", () => {
    writeConfigFile({ default: { relayUrl: "https://default" } });
    const env = sb.withEnv();
    expect(() => resolveConfig({ flags: { profile: "missing" }, env }))
      .toThrow(/profile "missing" not found/);
  });

  it("CLAWGARD_TOKEN env wins over token file", () => {
    writeToken("file-token", sb.withEnv());
    const env = sb.withEnv({ CLAWGARD_URL: "https://r", CLAWGARD_TOKEN: "env-token" });
    const cfg = resolveConfig({ flags: {}, env });
    expect(cfg.token).toBe("env-token");
  });

  it("reads token from file when CLAWGARD_TOKEN is unset", () => {
    writeToken("file-token", sb.withEnv());
    const env = sb.withEnv({ CLAWGARD_URL: "https://r" });
    const cfg = resolveConfig({ flags: {}, env });
    expect(cfg.token).toBe("file-token");
  });
});

describe("writeConfig / writeToken", () => {
  it("writes config.json with mode 0600 on unix", () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://r" }, "default", env);
    const path = join(sb.xdgConfigHome, "clawgard", "config.json");
    const st = statSync(path);
    if (process.platform !== "win32") {
      expect(st.mode & 0o777).toBe(0o600);
    }
  });

  it("writes hatchling.token with mode 0600 on unix", () => {
    const env = sb.withEnv();
    writeToken("abc", env);
    const path = join(sb.xdgConfigHome, "clawgard", "hatchling.token");
    const st = statSync(path);
    if (process.platform !== "win32") {
      expect(st.mode & 0o777).toBe(0o600);
    }
    expect(readToken(env)).toBe("abc");
  });

  it("preserves existing profiles when writing a new one", () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://a" }, "default", env);
    writeConfig({ relayUrl: "https://b" }, "staging", env);
    const cfgA = resolveConfig({ flags: {}, env });
    const cfgB = resolveConfig({ flags: { profile: "staging" }, env });
    expect(cfgA.relayUrl).toBe("https://a");
    expect(cfgB.relayUrl).toBe("https://b");
  });
});
