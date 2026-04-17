import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runSetup } from "../src/setup.js";
import { runStart } from "../src/start.js";
import { startFixtureServer, type FixtureServer } from "./helpers/fixture-server.js";
import { withTmpCache } from "./helpers/tmp-cache.js";

let fixture: FixtureServer;
beforeAll(async () => {
  fixture = await startFixtureServer("tests/fixtures");
});
afterAll(async () => {
  await fixture.close();
});

async function shaOf(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

// The sentinel binary is a Node script relying on the shebang to exec.
// On Windows we can't invoke it directly as a "binary"; skip there.
const skipOnWindows = process.platform === "win32";

describe.skipIf(skipOnWindows)("integration", () => {
  it("setup: downloads sentinel, verifies, invokes setup subcommand", async () => {
    const sha = await shaOf("tests/fixtures/sentinel-binary.js");
    await withTmpCache(async (root) => {
      const code = await runSetup({
        cacheRoot: root,
        version: "0.1.0",
        platform: "linux",
        arch: "x64",
        expectedHashOverride: sha,
        urlOverride: fixture.url("/sentinel-binary.js"),
        allowInsecureForTest: true,
      });
      expect(code).toBe(0);
    });
  });

  it("start: reuses cached binary and forwards args to listen", async () => {
    const sha = await shaOf("tests/fixtures/sentinel-binary.js");
    await withTmpCache(async (root) => {
      await runSetup({
        cacheRoot: root,
        version: "0.1.0",
        platform: "linux",
        arch: "x64",
        expectedHashOverride: sha,
        urlOverride: fixture.url("/sentinel-binary.js"),
        allowInsecureForTest: true,
      });
      const code = await runStart({
        cacheRoot: root,
        version: "0.1.0",
        platform: "linux",
        arch: "x64",
        expectedHashOverride: sha,
        // No urlOverride — cache hit must short-circuit the network.
        urlOverride: "https://127.0.0.1:1/must-not-be-called",
        extraArgs: ["--on-question", "python answer.py"],
      });
      expect(code).toBe(0);
    });
  });

  it("corruption: swap the served bytes and assert the skill fails closed", async () => {
    await withTmpCache(async (root) => {
      await expect(
        runSetup({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          expectedHashOverride: "a".repeat(64), // wrong
          urlOverride: fixture.url("/sentinel-binary.js"),
          allowInsecureForTest: true,
        }),
      ).rejects.toThrow(/did not match the expected hash/);
    });
  });
});
