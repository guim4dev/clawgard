import { bootstrapBinary, type BootstrapOpts } from "./lib/bootstrap.js";
import { captureStdout } from "./lib/spawn.js";

export interface VersionOpts extends BootstrapOpts {
  spawnCapture?: (cmd: string, args: string[]) => Promise<string>;
  println?: (s: string) => void;
}

export async function runVersion(opts: VersionOpts = {}): Promise<number> {
  const boot = await bootstrapBinary(opts);
  try {
    const capture = opts.spawnCapture ?? captureStdout;
    const out = (await capture(boot.binaryPath, ["version"])).trim();
    const println = opts.println ?? ((s: string) => console.log(s));
    println(`@clawgard/buddy-skill ${boot.skillVersion}`);
    println(out);
    return 0;
  } finally {
    await boot.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVersion({})
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
      process.exit(1);
    });
}
