import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { injectHashesFromAssets } from "../scripts-dev/build-skill.js";

describe("injectHashesFromAssets", () => {
  it("writes a typed hashes.ts from an asset manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "buddy-skill-inject-"));
    try {
      const target = join(dir, "hashes.ts");
      const assets = [
        { name: "clawgard-buddy-v0.1.0-darwin-arm64", sha256: "a".repeat(64) },
        { name: "clawgard-buddy-v0.1.0-darwin-amd64", sha256: "d".repeat(64) },
        { name: "clawgard-buddy-v0.1.0-linux-amd64", sha256: "b".repeat(64) },
        { name: "clawgard-buddy-v0.1.0-linux-arm64", sha256: "e".repeat(64) },
        { name: "clawgard-buddy-v0.1.0-windows-amd64.exe", sha256: "c".repeat(64) },
      ];
      await injectHashesFromAssets({ assets, version: "0.1.0", targetPath: target });
      const written = await readFile(target, "utf8");
      expect(written).toContain(`"darwin-arm64": "${"a".repeat(64)}"`);
      expect(written).toContain(`"linux-amd64": "${"b".repeat(64)}"`);
      expect(written).toContain(`"windows-amd64": "${"c".repeat(64)}"`);
      expect(written).toMatch(/GENERATED FILE/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly if the manifest is missing any supported platform", async () => {
    await expect(
      injectHashesFromAssets({
        assets: [{ name: "clawgard-buddy-v0.1.0-darwin-arm64", sha256: "a".repeat(64) }],
        version: "0.1.0",
        targetPath: "/tmp/whatever",
      }),
    ).rejects.toThrow(/missing assets for: darwin-amd64, linux-amd64, linux-arm64, windows-amd64/);
  });

  it("rejects non-hex SHA256 values", async () => {
    await expect(
      injectHashesFromAssets({
        assets: [{ name: "clawgard-buddy-v0.1.0-linux-amd64", sha256: "nothex" }],
        version: "0.1.0",
        targetPath: "/tmp/whatever",
      }),
    ).rejects.toThrow(/invalid sha256/);
  });
});
