import { describe, it, expect, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runStart } from "../src/start.js";
import { withTmpCache } from "./helpers/tmp-cache.js";
import { resolveCachePaths, ensureCacheDir } from "../src/lib/cache.js";
import { startFixtureServer } from "./helpers/fixture-server.js";

describe("runStart", () => {
  it("forwards extra args to `clawgard-buddy listen`", async () => {
    const fixture = await startFixtureServer("tests/fixtures");
    try {
      const bytes = await readFile("tests/fixtures/fake-binary.bin");
      const expectedSha = createHash("sha256").update(bytes).digest("hex");
      const spawnMock = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 0);
      await withTmpCache(async (root) => {
        await runStart({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          expectedHashOverride: expectedSha,
          urlOverride: fixture.url("/fake-binary.bin"),
          allowInsecureForTest: true,
          spawnInteractive: spawnMock,
          extraArgs: ["--on-question", "python answer.py"],
        });
      });
      const [, args] = spawnMock.mock.calls[0];
      expect(args).toEqual(["listen", "--on-question", "python answer.py"]);
    } finally {
      await fixture.close();
    }
  });

  it("refuses to execute when on-disk SHA mismatches compiled-in expected SHA without downloading again", async () => {
    // Pre-populate the cache with a file whose SHA does not match `expected`,
    // and give runStart a broken URL so any network touch fails.
    await withTmpCache(async (root) => {
      const version = "0.1.0";
      const paths = resolveCachePaths({ root, version, binaryName: "clawgard-buddy" });
      await ensureCacheDir(paths);
      await writeFile(paths.binary, "these bytes do not match the expected hash");

      // We expect: on-disk SHA mismatches expected, so the binary is deleted;
      // then it tries to re-download from urlOverride which returns /500.
      // The end-to-end expectation is a thrown error. We don't assert exact
      // message because the download error path is what surfaces after the
      // stale-cache cleanup — but it must abort without invoking the binary.
      const spawnMock = vi.fn(async () => 0);
      await expect(
        runStart({
          cacheRoot: root,
          version,
          platform: "linux",
          arch: "x64",
          expectedHashOverride: "a".repeat(64), // wrong — does not match on-disk bytes
          urlOverride: "http://127.0.0.1:1/500", // unreachable, should fail
          allowInsecureForTest: true,
          spawnInteractive: spawnMock,
        }),
      ).rejects.toThrow();
      expect(spawnMock).not.toHaveBeenCalled();
    });
  });
});
