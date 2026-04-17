import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import { startMockRelay, type MockRelay } from "./helpers/mock-idp.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

import { text, confirm } from "@clack/prompts";

let sb: Sandbox;
let relay: MockRelay;

beforeEach(async () => {
  sb = makeSandbox();
  relay = await startMockRelay();
});
afterEach(async () => {
  await relay.close();
  sb.cleanup();
  vi.clearAllMocks();
});

describe("runSetup", () => {
  it("prompts for relay URL, runs device flow, writes config + token", async () => {
    (text as unknown as Mock).mockResolvedValueOnce(relay.url);
    (confirm as unknown as Mock).mockResolvedValueOnce(true);
    relay.pollsBeforeSuccess(1);

    await runSetup({ flags: {}, env: sb.withEnv() });

    const cfg = JSON.parse(
      readFileSync(join(sb.xdgConfigHome, "clawgard", "config.json"), "utf8"),
    );
    expect(cfg.default.relayUrl).toBe(relay.url);

    const tok = readFileSync(
      join(sb.xdgConfigHome, "clawgard", "hatchling.token"),
      "utf8",
    ).trim();
    expect(tok).toBe("mock-access-token");
  });

  it("skips the URL prompt when CLAWGARD_URL is set", async () => {
    (confirm as unknown as Mock).mockResolvedValueOnce(true);
    relay.pollsBeforeSuccess(0);

    const env = sb.withEnv({ CLAWGARD_URL: relay.url });
    await runSetup({ flags: {}, env });

    expect((text as unknown as Mock).mock.calls.length).toBe(0);
    expect(existsSync(join(sb.xdgConfigHome, "clawgard", "hatchling.token"))).toBe(true);
  });

  it("writes to a named profile when --profile is passed", async () => {
    (text as unknown as Mock).mockResolvedValueOnce(relay.url);
    (confirm as unknown as Mock).mockResolvedValueOnce(true);
    relay.pollsBeforeSuccess(0);

    await runSetup({ flags: { profile: "staging" }, env: sb.withEnv() });

    const cfg = JSON.parse(
      readFileSync(join(sb.xdgConfigHome, "clawgard", "config.json"), "utf8"),
    );
    expect(cfg.staging.relayUrl).toBe(relay.url);
    expect(cfg.default).toBeUndefined();
  });
});
