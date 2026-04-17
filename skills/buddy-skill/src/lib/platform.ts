export type PlatformKey =
  | "darwin-arm64"
  | "darwin-amd64"
  | "linux-amd64"
  | "linux-arm64"
  | "windows-amd64";

export const SUPPORTED: readonly PlatformKey[] = [
  "darwin-arm64",
  "darwin-amd64",
  "linux-amd64",
  "linux-arm64",
  "windows-amd64",
] as const;

export interface Detected {
  key: PlatformKey;
  binaryName: "clawgard-buddy" | "clawgard-buddy.exe";
}

const ARCH: Record<string, string> = { x64: "amd64", arm64: "arm64" };
const OS: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" };

export function detectPlatform(platform: string, arch: string): Detected {
  const os = OS[platform];
  const a = ARCH[arch];
  const key = os && a ? (`${os}-${a}` as PlatformKey) : undefined;
  if (!key || !SUPPORTED.includes(key)) {
    throw new Error(
      `platform ${platform}/${arch} is not supported by @clawgard/buddy-skill. ` +
        `Supported combinations: ${SUPPORTED.join(", ")}.`,
    );
  }
  return { key, binaryName: os === "windows" ? "clawgard-buddy.exe" : "clawgard-buddy" };
}
