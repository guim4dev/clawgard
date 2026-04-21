import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "scripts/start": "src/start.ts",
    "dist/index": "src/index.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: ".",
  outExtension: () => ({ js: ".js" }),
  clean: false,
  sourcemap: true,
  dts: { entry: { "dist/index": "src/index.ts" } },
  shims: false,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
});
