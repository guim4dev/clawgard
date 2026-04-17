import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockIdp, type MockIdp } from "./helpers/mock-idp-e2e.js";

/**
 * End-to-end: run the real clawgard-server Docker image produced by Plan 1,
 * point it at our Node-hosted mock IdP, then exercise setup → list → ask.
 *
 * Skipped unless CLAWGARD_E2E=1 is set (e2e requires Docker + a Postgres side
 * container; slow enough to exclude from default test runs). Image defaults
 * to the locally-built `clawgard-server:dev` — override with
 * CLAWGARD_SERVER_IMAGE if the registry tag ever becomes available.
 */
const hasDocker = (() => {
  try { execFileSync("docker", ["version"], { stdio: "ignore" }); return true; }
  catch { return false; }
})();

const shouldRun = !!process.env.CLAWGARD_E2E && hasDocker;
const d = shouldRun ? describe : describe.skip;

const SERVER_IMAGE = process.env.CLAWGARD_SERVER_IMAGE ?? "clawgard-server:dev";

d("hatchling-skill e2e", () => {
  let server: StartedTestContainer;
  let relayUrl: string;
  let idp: MockIdp;
  let home: string;

  beforeAll(async () => {
    idp = await startMockIdp();
    server = await new GenericContainer(SERVER_IMAGE)
      .withEnvironment({
        CLAWGARD_OIDC_ISSUER: idp.issuer,
        CLAWGARD_OIDC_AUDIENCE: "clawgard-test",
        CLAWGARD_DATABASE_URL: process.env.CLAWGARD_DATABASE_URL ?? "",
        CLAWGARD_DEV_MODE: "true",
        CLAWGARD_ADMIN_KEY: idp.adminToken(),
      })
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/readyz", 8080))
      .start();
    relayUrl = `http://${server.getHost()}:${server.getMappedPort(8080)}`;
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
    await idp?.close();
  });

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "clawgard-e2e-"));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  function runScript(name: "setup" | "list" | "ask", args: string[] = [], input?: string): string {
    const script = join(new URL("..", import.meta.url).pathname, "scripts", `${name}.js`);
    return execFileSync("node", [script, ...args], {
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        APPDATA: join(home, "AppData", "Roaming"),
        CLAWGARD_URL: relayUrl,
        // For setup, auto-approve: the mock IdP accepts immediately.
        CLAWGARD_E2E_AUTOAPPROVE: "1",
      },
      input,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();
  }

  it("setup → list → ask round-trip", async () => {
    // Provision a buddy on the server via its admin API (helper in Plan 1 exposes this).
    await provisionBuddyOnServer(relayUrl, idp.adminToken(), {
      name: "echo-buddy",
      description: "echoes back",
      acl: { mode: "public" },
    });

    // setup
    runScript("setup");

    // list — must show echo-buddy
    const listed = runScript("list");
    expect(listed).toContain("echo-buddy");

    const buddyId = listed.match(/id:\s+([0-9a-f-]{36})/)?.[1];
    expect(buddyId).toBeDefined();

    // ask
    const answer = runScript("ask", [buddyId!, "ping"], "");
    expect(answer).toMatch(/pong|ping/i);
  }, 120_000);
});

// Implementation of these helpers lives in tests/helpers/e2e-harness.ts
// and uses the relay's admin endpoints to provision a buddy + connect an
// in-process echo-buddy WebSocket client. The function is declared here as
// an extern to keep the test file focused on the flow.
async function provisionBuddyOnServer(
  _relayUrl: string,
  _adminToken: string,
  _buddy: { name: string; description: string; acl: { mode: "public" } },
): Promise<void> {
  const { provisionBuddy } = await import("./helpers/e2e-harness.js");
  await provisionBuddy(_relayUrl, _adminToken, _buddy);
}
