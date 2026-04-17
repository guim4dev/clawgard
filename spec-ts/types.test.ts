import { describe, it, expect } from "vitest";
import type { components } from "./src/generated.js";

describe("spec types", () => {
  it("has Buddy schema", () => {
    const b: components["schemas"]["Buddy"] = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "test",
      description: "",
      acl: { mode: "public" },
      ownerEmail: "test@example.com",
      createdAt: new Date().toISOString(),
      online: false,
    };
    expect(b.name).toBe("test");
  });
});
