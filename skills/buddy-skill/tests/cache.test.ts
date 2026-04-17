import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { resolveCachePaths, ensureCacheDir, hasCachedBinary } from "../src/lib/cache.js";
import { withTmpCache } from "./helpers/tmp-cache.js";

describe("cache", () => {
  it("computes cache paths deterministically from version + binaryName", async () => {
    await withTmpCache(async (root) => {
      const paths = resolveCachePaths({ root, version: "0.1.0", binaryName: "clawgard-buddy" });
      expect(paths.dir).toContain("0.1.0");
      expect(paths.binary).toMatch(/clawgard-buddy$/);
      expect(paths.part).toMatch(/\.part$/);
    });
  });

  it("creates the cache dir with 0700 on unix", async () => {
    await withTmpCache(async (root) => {
      const paths = resolveCachePaths({ root, version: "0.1.0", binaryName: "clawgard-buddy" });
      await ensureCacheDir(paths);
      const s = await stat(paths.dir);
      if (process.platform !== "win32") {
        expect(s.mode & 0o777).toBe(0o700);
      }
    });
  });

  it("reports missing cached binary as false", async () => {
    await withTmpCache(async (root) => {
      const paths = resolveCachePaths({ root, version: "0.1.0", binaryName: "clawgard-buddy" });
      await ensureCacheDir(paths);
      expect(await hasCachedBinary(paths)).toBe(false);
    });
  });
});
