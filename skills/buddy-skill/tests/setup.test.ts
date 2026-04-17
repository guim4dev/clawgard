import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runSetup } from "../src/setup.js";
import { withTmpCache } from "./helpers/tmp-cache.js";
import { startFixtureServer, type FixtureServer } from "./helpers/fixture-server.js";

let fixture: FixtureServer;
beforeAll(async () => {
  fixture = await startFixtureServer("tests/fixtures");
});
afterAll(async () => {
  await fixture.close();
});

function shaOf(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

describe("runSetup", () => {
  it("downloads, verifies, and invokes the binary's `setup` subcommand", async () => {
    const bytes = await readFile("tests/fixtures/fake-binary.bin");
    const expectedSha = shaOf(bytes);
    const spawnMock = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 0);

    await withTmpCache(async (root) => {
      await runSetup({
        cacheRoot: root,
        version: "0.1.0",
        platform: "linux",
        arch: "x64",
        expectedHashOverride: expectedSha,
        urlOverride: fixture.url("/fake-binary.bin"),
        allowInsecureForTest: true,
        spawnInteractive: spawnMock,
        extraArgs: [],
      });
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toMatch(/clawgard-buddy$/);
    expect(args).toEqual(["setup"]);
  });

  it("refuses to exec if a hash is missing (empty hashes map)", async () => {
    await withTmpCache(async (root) => {
      await expect(
        runSetup({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          // no expectedHashOverride -> consults EXPECTED_HASHES which is empty in dev
          urlOverride: fixture.url("/fake-binary.bin"),
          allowInsecureForTest: true,
          spawnInteractive: vi.fn(async () => 0),
        }),
      ).rejects.toThrow(/no compiled-in hash available for linux-amd64/);
    });
  });

  it("blocks on an existing setup.lock with an actionable message", async () => {
    await withTmpCache(async (root) => {
      const lock = join(root, "setup.lock");
      await mkdir(root, { recursive: true });
      await writeFile(lock, `${process.pid}`);
      await expect(
        runSetup({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          expectedHashOverride: "a".repeat(64),
          urlOverride: fixture.url("/fake-binary.bin"),
          allowInsecureForTest: true,
          spawnInteractive: vi.fn(async () => 0),
        }),
      ).rejects.toThrow(/another setup appears to be running/);
    });
  });
});
