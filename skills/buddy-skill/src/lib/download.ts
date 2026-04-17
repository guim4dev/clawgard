import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm, chmod } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { CachePaths } from "./cache.js";
import type { PlatformKey } from "./platform.js";
import { assertHashesMatch } from "./verify.js";

export interface DownloadArgs {
  url: string;
  paths: CachePaths;
  expectedSha256: string;
  platformKey: PlatformKey;
  version: string;
  /** Test-only: accept http://. Never set by production code. */
  allowInsecureForTest?: boolean;
}

export async function downloadAndVerify(a: DownloadArgs): Promise<void> {
  const parsed = new URL(a.url);
  if (parsed.protocol !== "https:" && !a.allowInsecureForTest) {
    throw new Error(`refusing to download over non-https URL: ${a.url}`);
  }

  const res = await fetch(a.url, { redirect: "error" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText} (${a.url})`);
  }

  const hash = createHash("sha256");
  const sink = createWriteStream(a.paths.part, { mode: 0o600 });

  try {
    const source = Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
    source.on("data", (chunk: Buffer) => hash.update(chunk));
    await pipeline(source, sink);

    const actual = hash.digest("hex");
    assertHashesMatch({
      expected: a.expectedSha256,
      actual,
      url: a.url,
      platformKey: a.platformKey,
      version: a.version,
    });

    await rename(a.paths.part, a.paths.binary);
    if (process.platform !== "win32") {
      await chmod(a.paths.binary, 0o755);
    }
  } catch (err) {
    await rm(a.paths.part, { force: true });
    throw err;
  }
}
