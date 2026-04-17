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
  },
});
