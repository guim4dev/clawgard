import { describe, it, expect } from "vitest";
import { runInteractive, captureStdout } from "../src/lib/spawn.js";

describe("spawn", () => {
  it("runInteractive exits 0 on success", async () => {
    const code = await runInteractive(process.execPath, ["-e", "process.exit(0)"]);
    expect(code).toBe(0);
  });

  it("runInteractive returns non-zero exit code on failure", async () => {
    const code = await runInteractive(process.execPath, ["-e", "process.exit(7)"]);
    expect(code).toBe(7);
  });

  it("captureStdout returns trimmed stdout for short programs", async () => {
    const out = await captureStdout(process.execPath, ["-e", "process.stdout.write('hello')"]);
    expect(out).toBe("hello");
  });

  it("captureStdout throws with stderr on non-zero exit", async () => {
    await expect(
      captureStdout(process.execPath, ["-e", "process.stderr.write('bad'); process.exit(2)"]),
    ).rejects.toThrow(/bad/);
  });
});
