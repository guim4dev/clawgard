import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

describe("build output", () => {
  it("produces scripts/{setup,list,ask}.js after build", () => {
    execSync("pnpm run build", { cwd: root, stdio: "pipe" });
    for (const name of ["setup.js", "list.js", "ask.js"]) {
      expect(existsSync(join(root, "scripts", name))).toBe(true);
    }
  });
});
