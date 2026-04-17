import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runVersion } from "../src/version.js";
import { withTmpCache } from "./helpers/tmp-cache.js";
import { startFixtureServer } from "./helpers/fixture-server.js";

describe("runVersion", () => {
  it("prints the skill version and the binary-reported version", async () => {
    const fixture = await startFixtureServer("tests/fixtures");
    try {
      const bytes = await readFile("tests/fixtures/fake-binary.bin");
      const expectedSha = createHash("sha256").update(bytes).digest("hex");
      const lines: string[] = [];
      const captureMock = vi.fn<(cmd: string, args: string[]) => Promise<string>>(
        async () => "clawgard-buddy v0.1.0\n",
      );
      await withTmpCache(async (root) => {
        await runVersion({
          cacheRoot: root,
          version: "0.1.0",
          platform: "linux",
          arch: "x64",
          expectedHashOverride: expectedSha,
          urlOverride: fixture.url("/fake-binary.bin"),
          allowInsecureForTest: true,
          spawnCapture: captureMock,
          println: (s) => lines.push(s),
        });
      });
      expect(lines.join("\n")).toMatch(/@clawgard\/buddy-skill 0\.1\.0/);
      expect(lines.join("\n")).toMatch(/clawgard-buddy v0\.1\.0/);
    } finally {
      await fixture.close();
    }
  });
});
