import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import {
  configFilePath,
  tokenFilePath,
  writeConfig,
  writeToken,
} from "../src/lib/config.js";
import { runSetup } from "../src/setup.js";

vi.mock("open", () => ({ default: vi.fn(async () => null) }));
vi.mock("@clack/prompts", async () => {
  const actual = await vi.importActual<typeof import("@clack/prompts")>("@clack/prompts");
  return {
    ...actual,
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(),
    log: { info: vi.fn(), success: vi.fn(), error: vi.fn(), step: vi.fn() },
    text: vi.fn(),
    confirm: vi.fn(),
    isCancel: () => false,
  };
});

let sb: Sandbox;

function captureStdout() {
  const logs: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
  return {
    text: () => logs.join("\n"),
    lines: logs,
    restore: () => spy.mockRestore(),
  };
}

beforeEach(() => { sb = makeSandbox(); });
afterEach(() => { sb.cleanup(); vi.clearAllMocks(); });

describe("runSetup --list-relays", () => {
  it("prints an empty-state message when no relays are configured", async () => {
    const env = sb.withEnv();
    const out = captureStdout();
    try {
      await runSetup({ flags: { listRelays: true }, env });
    } finally {
      out.restore();
    }
    expect(out.text()).toMatch(/no relays configured/i);
  });

  it("prints a table of alias, relay URL, and token presence for each configured alias", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://alpha.test" }, "default", env);
    writeConfig({ relayUrl: "https://beta.test" }, "staging", env);
    writeToken("tok-default", env, "default");
    // intentionally no token for "staging"

    const out = captureStdout();
    try {
      await runSetup({ flags: { listRelays: true }, env });
    } finally {
      out.restore();
    }
    const text = out.text();
    expect(text).toContain("default");
    expect(text).toContain("https://alpha.test");
    expect(text).toContain("staging");
    expect(text).toContain("https://beta.test");

    // Token presence must appear per-alias. The default row is "yes", staging "no".
    const defaultLine = out.lines.find((l) => l.includes("default"))!;
    const stagingLine = out.lines.find((l) => l.includes("staging"))!;
    expect(defaultLine).toBeDefined();
    expect(stagingLine).toBeDefined();
    expect(defaultLine).toMatch(/\byes\b/);
    expect(stagingLine).toMatch(/\bno\b/);
  });

  it("does not prompt for a relay URL", async () => {
    const env = sb.withEnv();
    const { text } = await import("@clack/prompts");
    const out = captureStdout();
    try {
      await runSetup({ flags: { listRelays: true }, env });
    } finally {
      out.restore();
    }
    expect((text as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});

describe("runSetup --remove-relay", () => {
  it("removes the alias entry from config.json and deletes its token file", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://alpha.test" }, "default", env);
    writeConfig({ relayUrl: "https://beta.test" }, "staging", env);
    writeToken("tok-default", env, "default");
    writeToken("tok-staging", env, "staging");

    const out = captureStdout();
    try {
      await runSetup({ flags: { removeRelay: "staging" }, env });
    } finally {
      out.restore();
    }

    const cfg = JSON.parse(readFileSync(configFilePath(env), "utf8"));
    expect(cfg.staging).toBeUndefined();
    expect(cfg.default).toEqual({ relayUrl: "https://alpha.test" });
    expect(existsSync(tokenFilePath(env, "staging"))).toBe(false);
    expect(existsSync(tokenFilePath(env, "default"))).toBe(true);
  });

  it("throws a clear error when the alias does not exist", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://alpha.test" }, "default", env);

    await expect(
      runSetup({ flags: { removeRelay: "nope" }, env }),
    ).rejects.toThrow(/nope/);
  });

  it("throws a clear error when the alias does not exist and no config file exists at all", async () => {
    const env = sb.withEnv();
    await expect(
      runSetup({ flags: { removeRelay: "staging" }, env }),
    ).rejects.toThrow(/staging/);
  });

  it("removing the last alias leaves config.json as an empty object", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://alpha.test" }, "default", env);
    writeToken("tok-default", env, "default");

    const out = captureStdout();
    try {
      await runSetup({ flags: { removeRelay: "default" }, env });
    } finally {
      out.restore();
    }

    expect(existsSync(configFilePath(env))).toBe(true);
    const cfg = JSON.parse(readFileSync(configFilePath(env), "utf8"));
    expect(cfg).toEqual({});
    expect(existsSync(tokenFilePath(env, "default"))).toBe(false);
  });

  it("succeeds when the alias has a config entry but no token file", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://alpha.test" }, "staging", env);
    // no token written

    const out = captureStdout();
    try {
      await runSetup({ flags: { removeRelay: "staging" }, env });
    } finally {
      out.restore();
    }

    const cfg = JSON.parse(readFileSync(configFilePath(env), "utf8"));
    expect(cfg.staging).toBeUndefined();
  });
});
