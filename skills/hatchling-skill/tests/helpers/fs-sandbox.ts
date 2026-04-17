import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Sandbox {
  root: string;
  home: string;
  xdgConfigHome: string;
  cleanup: () => void;
  withEnv: (extra?: Record<string, string>) => NodeJS.ProcessEnv;
}

export function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "clawgard-test-"));
  const home = join(root, "home");
  const xdgConfigHome = join(home, ".config");
  return {
    root,
    home,
    xdgConfigHome,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    withEnv: (extra = {}) => ({
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: xdgConfigHome,
      APPDATA: join(home, "AppData", "Roaming"),
      ...extra,
    }),
  };
}
