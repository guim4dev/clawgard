import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:8080",
      "/auth": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/unit/**/*.spec.ts"],
    // Dynamic imports of view components under jsdom can be slow on first touch,
    // especially when Naive UI's heavy dependency graph has to be compiled on
    // demand. 15s gives headroom without masking real hangs.
    testTimeout: 15000,
    // Run worker threads serially. Parallel workers contend on jsdom + Vue SFC
    // compilation and routinely blow past even generous per-test timeouts when
    // the first router-guard test lazy-imports LoginView. Single-thread adds a
    // few seconds to the suite but makes it deterministic.
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
