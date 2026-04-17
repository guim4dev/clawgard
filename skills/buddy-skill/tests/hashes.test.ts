import { describe, it, expect } from "vitest";
import { EXPECTED_HASHES, type ExpectedHashes } from "../src/lib/hashes.js";

describe("EXPECTED_HASHES", () => {
  it("is a record keyed by PlatformKey", () => {
    const keys = Object.keys(EXPECTED_HASHES) as (keyof ExpectedHashes)[];
    // empty in dev; publish-time injector fills it
    for (const k of keys) {
      expect(EXPECTED_HASHES[k]).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
