import { rm, open } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { detectPlatform, type PlatformKey } from "./platform.js";
import { EXPECTED_HASHES } from "./hashes.js";
import { buildReleaseAssetUrl } from "./release-url.js";
import { resolveCachePaths, ensureCacheDir, hasCachedBinary, type CachePaths } from "./cache.js";
import { downloadAndVerify } from "./download.js";

export interface BootstrapOpts {
  cacheRoot?: string;
  version?: string;
  platform?: string;
  arch?: string;
  /** Test hook: bypass EXPECTED_HASHES lookup. */
  expectedHashOverride?: string;
  /** Test hook: override the download URL. */
  urlOverride?: string;
  /** Test hook: accept http://. Never set by production code. */
  allowInsecureForTest?: boolean;
}

export interface BootstrapResult {
  binaryPath: string;
  skillVersion: string;
  platformKey: PlatformKey;
  paths: CachePaths;
  /** Must be called after the caller finishes exec to release the lock. */
  release: () => Promise<void>;
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

function readPackageVersion(): string {
  // The compiled file may live at `<pkg>/scripts/*.js` (Claude Code entry)
  // or at `<pkg>/src/lib/bootstrap.ts` (tests + TS sources). Walk up until
  // we find a package.json whose name is @clawgard/buddy-skill.
  const here = new URL(import.meta.url);
  for (const rel of ["../package.json", "../../package.json", "../../../package.json"]) {
    try {
      const candidate = new URL(rel, here);
      const raw = readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      if (parsed.name === "@clawgard/buddy-skill" && parsed.version) {
        return parsed.version;
      }
    } catch {
      // keep walking
    }
  }
  throw new Error(
    "cannot locate @clawgard/buddy-skill package.json to read version; " +
      "pass `version` explicitly when calling bootstrapBinary.",
  );
}

/**
 * Resolve cache paths, acquire the setup lock, ensure the cached binary is
 * present AND matches the expected SHA, downloading + verifying over HTTPS if
 * needed. On return, the binary at `binaryPath` is known to match the expected
 * compiled-in hash. The caller MUST call `release()` after exec to drop the
 * lock.
 */
export async function bootstrapBinary(opts: BootstrapOpts = {}): Promise<BootstrapResult> {
  const skillVersion = opts.version ?? readPackageVersion();
  const { key, binaryName } = detectPlatform(
    opts.platform ?? process.platform,
    opts.arch ?? process.arch,
  );
  const expected = opts.expectedHashOverride ?? EXPECTED_HASHES[key];
  if (!expected) {
    throw new Error(
      `no compiled-in hash available for ${key} in @clawgard/buddy-skill@${skillVersion}. ` +
        `This build is unpublishable; run 'pnpm run inject-hashes' before publishing.`,
    );
  }

  const paths = resolveCachePaths({ root: opts.cacheRoot, version: skillVersion, binaryName });
  await ensureCacheDir(paths);

  const lockPath = join(paths.root, "setup.lock");
  let lock: Awaited<ReturnType<typeof open>>;
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
      const url = opts.urlOverride ?? buildReleaseAssetUrl({ version: skillVersion, key });
      await downloadAndVerify({
        url,
        paths,
        expectedSha256: expected,
        platformKey: key,
        version: skillVersion,
        allowInsecureForTest: opts.allowInsecureForTest,
      });
    }
  } catch (err) {
    await lock.close();
    await rm(lockPath, { force: true });
    throw err;
  }

  return {
    binaryPath: paths.binary,
    skillVersion,
    platformKey: key,
    paths,
    release: async () => {
      await lock.close();
      await rm(lockPath, { force: true });
    },
  };
}
