import { describe, it, expect } from "vitest";
import { buildReleaseAssetUrl } from "../src/lib/release-url.js";

describe("buildReleaseAssetUrl", () => {
  it("pins the URL to the skill version", () => {
    const url = buildReleaseAssetUrl({ version: "0.1.0", key: "darwin-arm64" });
    expect(url).toBe(
      "https://github.com/clawgard/clawgard/releases/download/v0.1.0/clawgard-buddy-v0.1.0-darwin-arm64",
    );
  });

  it("appends .exe for windows", () => {
    const url = buildReleaseAssetUrl({ version: "0.1.0", key: "windows-amd64" });
    expect(url).toBe(
      "https://github.com/clawgard/clawgard/releases/download/v0.1.0/clawgard-buddy-v0.1.0-windows-amd64.exe",
    );
  });

  it("always uses HTTPS", () => {
    expect(buildReleaseAssetUrl({ version: "0.1.0", key: "linux-amd64" })).toMatch(/^https:\/\//);
  });
});
