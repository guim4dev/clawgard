import { describe, it, expect, afterEach } from "vitest";
import { configDir } from "../src/lib/config.js";

const originalPlatform = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

afterEach(() => setPlatform(originalPlatform));

describe("configDir — cross-platform", () => {
  it("uses XDG_CONFIG_HOME when set (Linux/macOS)", () => {
    setPlatform("linux");
    const dir = configDir({ XDG_CONFIG_HOME: "/custom/xdg", HOME: "/home/u" } as NodeJS.ProcessEnv);
    expect(dir).toBe("/custom/xdg/clawgard");
  });

  it("defaults to ~/.config/clawgard on Linux when XDG_CONFIG_HOME is unset", () => {
    setPlatform("linux");
    const dir = configDir({ HOME: "/home/u" } as NodeJS.ProcessEnv);
    expect(dir).toBe("/home/u/.config/clawgard");
  });

  it("defaults to ~/.config/clawgard on macOS (NOT ~/Library/...)", () => {
    setPlatform("darwin");
    const dir = configDir({ HOME: "/Users/u" } as NodeJS.ProcessEnv);
    expect(dir).toBe("/Users/u/.config/clawgard");
  });

  it("uses %APPDATA%\\Clawgard on Windows", () => {
    setPlatform("win32");
    const dir = configDir({
      APPDATA: "C:\\Users\\u\\AppData\\Roaming",
      USERPROFILE: "C:\\Users\\u",
    } as NodeJS.ProcessEnv);
    expect(dir.replaceAll("\\", "/")).toMatch(/AppData\/Roaming\/Clawgard$/);
  });
});
