import type { PlatformKey } from "./platform.js";

export class VerificationError extends Error {
  readonly code = "CLAWGARD_HASH_MISMATCH";
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

export interface VerifyArgs {
  expected: string;
  actual: string;
  url: string;
  platformKey: PlatformKey;
  version: string;
}

export function formatMismatchMessage(a: VerifyArgs): string {
  return [
    `The clawgard-buddy binary downloaded from ${a.url} did not match the expected hash.`,
    ``,
    `  platform: ${a.platformKey}`,
    `  version:  ${a.version}`,
    `  expected: ${a.expected.toLowerCase()}`,
    `  actual:   ${a.actual.toLowerCase()}`,
    ``,
    `This could mean:`,
    `  - the release was tampered with in transit,`,
    `  - the skill version is outdated and points at an old release,`,
    `  - GitHub is serving a cached or partial artifact.`,
    ``,
    `Next steps:`,
    `  1. Run: npm update @clawgard/buddy-skill`,
    `  2. If the problem persists, report at https://github.com/clawgard/clawgard/issues`,
    `     and include the output above.`,
    ``,
    `The corrupted file has been deleted. No binary will be executed.`,
  ].join("\n");
}

export function assertHashesMatch(a: VerifyArgs): void {
  if (a.expected.toLowerCase() === a.actual.toLowerCase()) return;
  throw new VerificationError(formatMismatchMessage(a));
}
