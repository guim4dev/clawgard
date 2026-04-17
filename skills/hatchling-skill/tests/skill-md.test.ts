import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const md = readFileSync(
  join(new URL("..", import.meta.url).pathname, "SKILL.md"),
  "utf8",
);

describe("SKILL.md", () => {
  it("starts with YAML frontmatter containing name and description", () => {
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toMatch(/^name: clawgard-hatchling\s*$/m);
    expect(md).toMatch(/^description: .+$/m);
  });

  it("has an H1 title", () => {
    expect(md).toMatch(/^# Clawgard Hatchling/m);
  });

  it("references all three script commands", () => {
    for (const s of ["clawgard-hatchling-setup", "clawgard-hatchling-list", "clawgard-hatchling-ask"]) {
      expect(md).toContain(s);
    }
  });

  it("includes an invocation example for each script", () => {
    expect(md).toMatch(/When to run setup/i);
    expect(md).toMatch(/When to run list/i);
    expect(md).toMatch(/When to run ask/i);
  });
});
