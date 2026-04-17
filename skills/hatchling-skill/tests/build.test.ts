import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

describe("build output", () => {
  it("produces scripts/{setup,list,ask}.js after build", () => {
    execSync("pnpm run build", { cwd: root, stdio: "pipe" });
    for (const name of ["setup.js", "list.js", "ask.js"]) {
      const path = join(root, "scripts", name);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf8");
      expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
      // Must not contain unbundled import of workspace deps (should be inlined).
      expect(content).not.toMatch(/from ['"]@clawgard\/spec['"]/);
    }
  });

  it("scripts run without arguments and print their usage/help", () => {
    const out = execSync(`node ${join(root, "scripts", "list.js")} --help`, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    expect(out).toMatch(/Usage|Options/i);
  });
});
