import { describe, it, expect } from "vitest";
import { detectPlatform, SUPPORTED } from "../src/lib/platform.js";

describe("detectPlatform", () => {
  it.each([
    ["darwin", "arm64", "darwin-arm64"],
    ["darwin", "x64", "darwin-amd64"],
    ["linux", "x64", "linux-amd64"],
    ["linux", "arm64", "linux-arm64"],
    ["win32", "x64", "windows-amd64"],
  ])("maps %s/%s to %s", (plat, arch, expected) => {
    expect(detectPlatform(plat, arch)).toEqual({
      key: expected,
      binaryName: expected.startsWith("windows") ? "clawgard-buddy.exe" : "clawgard-buddy",
    });
  });

  it("throws on unsupported combo with a listing of supported combos", () => {
    expect(() => detectPlatform("aix", "ppc64")).toThrow(/aix\/ppc64.*not supported/i);
    expect(() => detectPlatform("aix", "ppc64")).toThrow(/darwin-arm64/);
  });

  it("exports the supported list", () => {
    expect(SUPPORTED).toContain("darwin-arm64");
    expect(SUPPORTED).toContain("windows-amd64");
  });
});
