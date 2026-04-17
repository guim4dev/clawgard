import { describe, it, expect } from "vitest";
import { formatMismatchMessage, assertHashesMatch } from "../src/lib/verify.js";

describe("verify", () => {
  it("no-ops when hashes match (case-insensitive)", () => {
    expect(() =>
      assertHashesMatch({
        expected: "a".repeat(64),
        actual: "A".repeat(64),
        url: "https://example.com/bin",
        platformKey: "linux-amd64",
        version: "0.1.0",
      }),
    ).not.toThrow();
  });

  it("throws an actionable VerificationError on mismatch", () => {
    const err = () =>
      assertHashesMatch({
        expected: "a".repeat(64),
        actual: "b".repeat(64),
        url: "https://example.com/bin",
        platformKey: "linux-amd64",
        version: "0.1.0",
      });
    expect(err).toThrow(/did not match the expected hash/);
    expect(err).toThrow(/expected: a{64}/);
    expect(err).toThrow(/actual:   b{64}/);
    expect(err).toThrow(/npm update @clawgard\/buddy-skill/);
    expect(err).toThrow(/https:\/\/github.com\/clawgard\/clawgard\/issues/);
  });

  it("formats the mismatch message with both hashes and next steps", () => {
    const msg = formatMismatchMessage({
      expected: "a".repeat(64),
      actual: "b".repeat(64),
      url: "https://example.com/bin",
      platformKey: "linux-amd64",
      version: "0.1.0",
    });
    expect(msg).toContain("linux-amd64");
    expect(msg).toContain("0.1.0");
    expect(msg).toContain("https://example.com/bin");
  });
});
