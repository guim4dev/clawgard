import { writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SUPPORTED, type PlatformKey } from "../src/lib/platform.js";

const execFileP = promisify(execFile);

export interface ReleaseAsset {
  name: string;
  sha256: string;
}

export interface InjectArgs {
  assets: ReleaseAsset[];
  version: string;
  targetPath: string;
}

function keyFor(assetName: string, version: string): PlatformKey | undefined {
  const prefix = `clawgard-buddy-v${version}-`;
  if (!assetName.startsWith(prefix)) return undefined;
  const rest = assetName.slice(prefix.length).replace(/\.exe$/, "");
  return SUPPORTED.includes(rest as PlatformKey) ? (rest as PlatformKey) : undefined;
}

export async function injectHashesFromAssets(a: InjectArgs): Promise<void> {
  const mapping: Partial<Record<PlatformKey, string>> = {};
  for (const asset of a.assets) {
    const k = keyFor(asset.name, a.version);
    if (!k) continue;
    if (!/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new Error(`invalid sha256 for ${asset.name}: ${asset.sha256}`);
    }
    mapping[k] = asset.sha256.toLowerCase();
  }
  const missing = SUPPORTED.filter((k) => !mapping[k]);
  if (missing.length) {
    throw new Error(`missing assets for: ${missing.join(", ")}`);
  }

  const entries = SUPPORTED.map((k) => `  "${k}": "${mapping[k]}"`).join(",\n");
  const content = `import type { PlatformKey } from "./platform.js";

// GENERATED FILE — injected by scripts-dev/build-skill.ts at publish time.
// Do not edit by hand. Regenerate with: pnpm run inject-hashes
export type ExpectedHashes = Partial<Record<PlatformKey, string>>;
export const EXPECTED_HASHES: ExpectedHashes = {
${entries},
};
`;
  await writeFile(a.targetPath, content, "utf8");
}

/**
 * Fetch release-asset SHAs from GitHub for the given skill version.
 *
 * DEVIATION FROM PLAN: no remote repository exists yet (Plan 6 will add the
 * release pipeline). On `main` this function is not invoked by tests — only by
 * the `prepublishOnly` npm hook when we eventually publish. Tests exercise
 * `injectHashesFromAssets` directly with a synthetic asset array.
 *
 * Expects `gh` CLI logged in with read access to the repo. The manifest we
 * consume is produced by Plan 6's release pipeline, which emits SHA256
 * sidecars. We read each `.sha256` sibling for each binary asset.
 */
export async function fetchAssetsFromGh(version: string): Promise<ReleaseAsset[]> {
  const { stdout } = await execFileP("gh", [
    "release",
    "view",
    `v${version}`,
    "--repo",
    "clawgard/clawgard",
    "--json",
    "assets",
  ]);
  const parsed = JSON.parse(stdout) as { assets: { name: string; url: string }[] };
  const out: ReleaseAsset[] = [];
  for (const a of parsed.assets) {
    if (!a.name.endsWith(".sha256")) continue;
    const binaryName = a.name.replace(/\.sha256$/, "");
    const { stdout: shaBody } = await execFileP("gh", [
      "release",
      "download",
      `v${version}`,
      "--repo",
      "clawgard/clawgard",
      "--pattern",
      a.name,
      "--output",
      "-",
    ]);
    const sha = shaBody.trim().split(/\s+/)[0];
    out.push({ name: binaryName, sha256: sha });
  }
  return out;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const assets = await fetchAssetsFromGh(pkg.version);
    await injectHashesFromAssets({
      assets,
      version: pkg.version,
      targetPath: "src/lib/hashes.ts",
    });
    console.log(`injected ${assets.length} hashes into src/lib/hashes.ts for v${pkg.version}`);
  })().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  });
}
