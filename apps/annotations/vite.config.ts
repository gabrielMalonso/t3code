import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function bundleContentScript(): Plugin {
  return {
    name: "annotations-content-bundle",
    async closeBundle() {
      await esbuild({
        entryPoints: [resolve(rootDir, "src/content/boot.ts")],
        bundle: true,
        outfile: resolve(rootDir, "dist/content/boot.js"),
        format: "iife",
        platform: "browser",
        target: "chrome109",
        sourcemap: true,
      });
    },
  };
}

export default defineConfig({
  publicDir: "public",
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        "background/service-worker": resolve(rootDir, "src/background/service-worker.ts"),
        "offscreen/offscreen": resolve(rootDir, "src/offscreen/offscreen.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "shared/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [bundleContentScript()],
});
