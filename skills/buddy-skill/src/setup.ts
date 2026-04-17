import { rm, open } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { detectPlatform } from "./lib/platform.js";
import { EXPECTED_HASHES } from "./lib/hashes.js";
import { buildReleaseAssetUrl } from "./lib/release-url.js";
import { resolveCachePaths, ensureCacheDir, hasCachedBinary } from "./lib/cache.js";
import { downloadAndVerify } from "./lib/download.js";
import { runInteractive } from "./lib/spawn.js";

export interface SetupOpts {
  cacheRoot?: string;
  version?: string;
  platform?: string;
  arch?: string;
  expectedHashOverride?: string; // test hook
  urlOverride?: string; // test hook
  allowInsecureForTest?: boolean; // test hook
  spawnInteractive?: (cmd: string, args: string[]) => Promise<number>;
  extraArgs?: string[];
}

async function onDiskSha(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const s = createReadStream(path);
    s.on("data", (c) => hash.update(c as Buffer));
    s.on("end", () => resolve());
    s.on("error", reject);
  });
  return hash.digest("hex");
}

export async function runSetup(opts: SetupOpts = {}): Promise<number> {
  const version = opts.version ?? readPackageVersion();
  const { key, binaryName } = detectPlatform(
    opts.platform ?? process.platform,
    opts.arch ?? process.arch,
  );
  const expected = opts.expectedHashOverride ?? EXPECTED_HASHES[key];
  if (!expected) {
    throw new Error(
      `no compiled-in hash available for ${key} in @clawgard/buddy-skill@${version}. ` +
        `This build is unpublishable; run 'pnpm run inject-hashes' before publishing.`,
    );
  }

  const paths = resolveCachePaths({ root: opts.cacheRoot, version, binaryName });
  await ensureCacheDir(paths);

  const lockPath = join(paths.root, "setup.lock");
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw new Error(
      `another setup appears to be running (lock at ${lockPath}). ` +
        `If this is stale, remove the file and retry.`,
    );
  }

  try {
    if (await hasCachedBinary(paths)) {
      const actual = await onDiskSha(paths.binary);
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        await rm(paths.binary, { force: true });
      }
    }
    if (!(await hasCachedBinary(paths))) {
      const url = opts.urlOverride ?? buildReleaseAssetUrl({ version, key });
      await downloadAndVerify({
        url,
        paths,
        expectedSha256: expected,
        platformKey: key,
        version,
        allowInsecureForTest: opts.allowInsecureForTest,
      });
    }
    const runner = opts.spawnInteractive ?? runInteractive;
    return await runner(paths.binary, ["setup", ...(opts.extraArgs ?? [])]);
  } finally {
    if (lock) await lock.close();
    await rm(lockPath, { force: true });
  }
}

function readPackageVersion(): string {
  // In a compiled skill this is read from the installed package.json.
  const pkgUrl = new URL("../package.json", import.meta.url);
  const raw = readFileSync(pkgUrl, "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}
