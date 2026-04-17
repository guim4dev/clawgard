import { runSetup, type SetupOpts } from "./setup.js";
import { runInteractive } from "./lib/spawn.js";

export interface StartOpts extends SetupOpts {}

export async function runStart(opts: StartOpts = {}): Promise<number> {
  const realRunner = opts.spawnInteractive ?? runInteractive;
  return runSetup({
    ...opts,
    spawnInteractive: async (cmd, args) => {
      const rewritten = args[0] === "setup" ? ["listen", ...args.slice(1)] : args;
      return realRunner(cmd, rewritten);
    },
  });
}
