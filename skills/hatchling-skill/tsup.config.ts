import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    setup: "src/setup.ts",
    list: "src/list.ts",
    ask: "src/ask.ts",
  },
  outDir: "scripts",
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: false,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
});
