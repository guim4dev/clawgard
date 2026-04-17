import { mkdir, chmod } from "node:fs/promises";
import { stat } from "node:fs/promises";
import envPaths from "env-paths";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface CachePaths {
  root: string;
  dir: string;
  binary: string;
  part: string;
}

export interface ResolveArgs {
  root?: string; // override for tests
  version: string;
  binaryName: string;
}

export function resolveCachePaths({ root, version, binaryName }: ResolveArgs): CachePaths {
  const base = root ?? envPaths("clawgard", { suffix: "" }).cache;
  const dir = join(base, version);
  const binary = join(dir, binaryName);
  const part = `${binary}.${process.pid}.${randomBytes(4).toString("hex")}.part`;
  return { root: base, dir, binary, part };
}

export async function ensureCacheDir(paths: CachePaths): Promise<void> {
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(paths.dir, 0o700);
  }
}

export async function hasCachedBinary(paths: CachePaths): Promise<boolean> {
  try {
    const s = await stat(paths.binary);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}
