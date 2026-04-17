import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runSetup } from "../src/setup.js";
import { withTmpCache } from "./helpers/tmp-cache.js";
import { startFixtureServer } from "./helpers/fixture-server.js";

async function shaOfFixture(): Promise<string> {
  const bytes = await readFile("tests/fixtures/fake-binary.bin");
  return createHash("sha256").update(bytes).digest("hex");
}

describe("cosign", () => {
  it("off by default — no cosign subprocess invoked", async () => {
    const cosignSpy = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 0);
    const sha = await shaOfFixture();
    const fixture = await startFixtureServer("tests/fixtures");
    try {
      await withTmpCache(async (root) => {
        await runSetup({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          expectedHashOverride: sha,
          urlOverride: fixture.url("/fake-binary.bin"),
          allowInsecureForTest: true,
          spawnInteractive: async () => 0,
          cosignCommand: cosignSpy,
        });
      });
    } finally {
      await fixture.close();
    }
    expect(cosignSpy).not.toHaveBeenCalled();
  });

  it("when enabled and cosign is not wired, fails with an actionable error", async () => {
    const sha = await shaOfFixture();
    const fixture = await startFixtureServer("tests/fixtures");
    try {
      await withTmpCache(async (root) => {
        await expect(
          runSetup({
            cacheRoot: root,
            version: "0.1.0",
            platform: "linux",
            arch: "x64",
            expectedHashOverride: sha,
            urlOverride: fixture.url("/fake-binary.bin"),
            allowInsecureForTest: true,
            verifySignature: true,
            spawnInteractive: async () => 0,
          }),
        ).rejects.toThrow(/Cosign integration is not available/);
      });
    } finally {
      await fixture.close();
    }
  });

  it("when enabled and signature verifies (exit 0), exec proceeds normally", async () => {
    const sha = await shaOfFixture();
    const cosignSpy = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 0);
    const spawnSpy = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 0);
    const fixture = await startFixtureServer("tests/fixtures");
    try {
      await withTmpCache(async (root) => {
        await runSetup({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          expectedHashOverride: sha,
          urlOverride: fixture.url("/fake-binary.bin"),
          allowInsecureForTest: true,
          verifySignature: true,
          cosignCommand: cosignSpy,
          spawnInteractive: spawnSpy,
        });
      });
    } finally {
      await fixture.close();
    }
    expect(cosignSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = cosignSpy.mock.calls[0];
    expect(cmd).toBe("cosign");
    expect(args[0]).toBe("verify-blob");
    expect(args[1]).toBe("--bundle");
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("when enabled and signature fails (non-zero exit), refuses to exec", async () => {
    const sha = await shaOfFixture();
    const cosignSpy = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 1);
    const spawnSpy = vi.fn<(cmd: string, args: string[]) => Promise<number>>(async () => 0);
    const fixture = await startFixtureServer("tests/fixtures");
    try {
      await withTmpCache(async (root) => {
        await expect(
          runSetup({
            cacheRoot: root,
            version: "0.1.0",
            platform: "linux",
            arch: "x64",
            expectedHashOverride: sha,
            urlOverride: fixture.url("/fake-binary.bin"),
            allowInsecureForTest: true,
            verifySignature: true,
            cosignCommand: cosignSpy,
            spawnInteractive: spawnSpy,
          }),
        ).rejects.toThrow(/cosign verify-blob failed/);
      });
    } finally {
      await fixture.close();
    }
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
