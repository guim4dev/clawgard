import { bootstrapBinary, type BootstrapOpts } from "./lib/bootstrap.js";
import { runInteractive } from "./lib/spawn.js";

export interface StartOpts extends BootstrapOpts {
  spawnInteractive?: (cmd: string, args: string[]) => Promise<number>;
  extraArgs?: string[];
}

export async function runStart(opts: StartOpts = {}): Promise<number> {
  const boot = await bootstrapBinary(opts);
  try {
    const runner = opts.spawnInteractive ?? runInteractive;
    return await runner(boot.binaryPath, ["listen", ...(opts.extraArgs ?? [])]);
  } finally {
    await boot.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStart({ extraArgs: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
      process.exit(1);
    });
}
