import type { PlatformKey } from "./platform.js";

export interface ReleaseAssetCoords {
  version: string; // bare version, e.g. "0.1.0"
  key: PlatformKey;
}

const OWNER = "clawgard";
const REPO = "clawgard";

export function buildReleaseAssetUrl({ version, key }: ReleaseAssetCoords): string {
  const ext = key.startsWith("windows-") ? ".exe" : "";
  return `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/clawgard-buddy-v${version}-${key}${ext}`;
}
