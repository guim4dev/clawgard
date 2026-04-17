import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;

function packFiles(): string[] {
  const out = execSync("npm pack --dry-run --json", { cwd: root, stdio: "pipe" }).toString();
  const parsed = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>;
  return parsed[0].files.map((f) => f.path);
}

describe("npm pack", () => {
  it("includes SKILL.md, README.md, package.json, and scripts/*", () => {
    // Build first so scripts/ exists.
    execSync("pnpm run build", { cwd: root, stdio: "pipe" });
    const files = packFiles();
    expect(files).toContain("SKILL.md");
    expect(files).toContain("README.md");
    expect(files).toContain("package.json");
    expect(files.some((f) => f.startsWith("scripts/setup.js"))).toBe(true);
    expect(files.some((f) => f.startsWith("scripts/list.js"))).toBe(true);
    expect(files.some((f) => f.startsWith("scripts/ask.js"))).toBe(true);
  });

  it("does NOT include src/, tests/, tsconfig.json, tsup.config.ts, vitest.config.ts", () => {
    execSync("pnpm run build", { cwd: root, stdio: "pipe" });
    const files = packFiles();
    for (const bad of ["tsconfig.json", "tsup.config.ts", "vitest.config.ts"]) {
      expect(files).not.toContain(bad);
    }
    expect(files.some((f) => f.startsWith("src/"))).toBe(false);
    expect(files.some((f) => f.startsWith("tests/"))).toBe(false);
  });
});
