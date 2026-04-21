import { describe, it, expect } from "vitest";
import { buildHookCommand, getConfig } from "../src/start.js";

describe("buildHookCommand", () => {
  it("produces a portable command with --bridge-url (no shell env prefix)", () => {
    const cmd = buildHookCommand("127.0.0.1", 8765);
    expect(cmd).toBe(
      "npx @clawgard/openclaw-buddy --hook-only --bridge-url=http://127.0.0.1:8765",
    );
    // VAR=value prefixes break on Windows cmd.exe even with shell:true.
    expect(cmd).not.toMatch(/^[A-Z_]+=/);
  });
});

describe("getConfig", () => {
  it("builds BridgeConfig from env vars", () => {
    const cfg = getConfig({
      OPENCLAW_SESSION_KEY: "k",
      OPENCLAW_GATEWAY_URL: "http://gw",
      OPENCLAW_BRIDGE_PORT: "9000",
      OPENCLAW_BRIDGE_HOST: "0.0.0.0",
      OPENCLAW_TIMEOUT_MS: "30000",
    } as NodeJS.ProcessEnv);

    expect(cfg).toEqual({
      port: 9000,
      host: "0.0.0.0",
      openclaw: {
        sessionKey: "k",
        gatewayUrl: "http://gw",
        gatewayToken: undefined,
        timeoutMs: 30000,
      },
    });
  });

  it("applies defaults when only session key is set", () => {
    const cfg = getConfig({ OPENCLAW_SESSION_KEY: "k" } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(8765);
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.openclaw.gatewayUrl).toBe("http://localhost:8080");
    expect(cfg.openclaw.timeoutMs).toBe(120000);
    expect(cfg.openclaw.gatewayToken).toBeUndefined();
  });
});
