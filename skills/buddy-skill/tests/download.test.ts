import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, stat } from "node:fs/promises";
import { startFixtureServer, type FixtureServer } from "./helpers/fixture-server.js";
import { withTmpCache } from "./helpers/tmp-cache.js";
import { resolveCachePaths, ensureCacheDir } from "../src/lib/cache.js";
import { downloadAndVerify } from "../src/lib/download.js";

const FAKE_SHA = "ff9d9c836b97e21d02e30a4251d054e9a75e5a4173dd8782b130bc10f6a77f99";

let fixture: FixtureServer;
beforeAll(async () => {
  fixture = await startFixtureServer("tests/fixtures");
});
afterAll(async () => {
  await fixture.close();
});

describe("downloadAndVerify (happy path)", () => {
  it("streams the file, verifies hash, and atomically renames into place", async () => {
    await withTmpCache(async (root) => {
      const paths = resolveCachePaths({ root, version: "0.1.0", binaryName: "clawgard-buddy" });
      await ensureCacheDir(paths);
      await downloadAndVerify({
        url: fixture.url("/fake-binary.bin"),
        paths,
        expectedSha256: FAKE_SHA,
        platformKey: "linux-amd64",
        version: "0.1.0",
        allowInsecureForTest: true,
      });
      const onDisk = await readFile(paths.binary);
      const fixtureBytes = await readFile("tests/fixtures/fake-binary.bin");
      expect(onDisk.equals(fixtureBytes)).toBe(true);
      const s = await stat(paths.binary);
      if (process.platform !== "win32") {
        expect(s.mode & 0o777).toBe(0o755);
      }
    });
  });
});
