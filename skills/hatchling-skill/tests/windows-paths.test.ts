import { describe, it, expect, afterEach } from "vitest";
import { configDir, configFilePath, tokenFilePath } from "../src/lib/config.js";

const originalPlatform = process.platform;
afterEach(() =>
  Object.defineProperty(process, "platform", {
    value: originalPlatform,
    configurable: true,
  }),
);

describe("Windows paths", () => {
  it("uses %APPDATA%\\Clawgard for config dir", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const env = {
      APPDATA: "C:\\Users\\Alice\\AppData\\Roaming",
      USERPROFILE: "C:\\Users\\Alice",
    } as NodeJS.ProcessEnv;
    expect(configDir(env).replaceAll("\\", "/")).toBe(
      "C:/Users/Alice/AppData/Roaming/Clawgard",
    );
    expect(configFilePath(env).replaceAll("\\", "/")).toBe(
      "C:/Users/Alice/AppData/Roaming/Clawgard/config.json",
    );
    expect(tokenFilePath(env).replaceAll("\\", "/")).toBe(
      "C:/Users/Alice/AppData/Roaming/Clawgard/hatchling.token",
    );
  });

  it("falls back to env-paths output when APPDATA is missing on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    // With neither APPDATA nor XDG_CONFIG_HOME nor HOME, envPaths provides a default.
    const dir = configDir({} as NodeJS.ProcessEnv);
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });
});
