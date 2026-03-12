import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        "~": srcPath,
      },
    },
    test: {
      include: [
        "src/components/ChatView.browser.tsx",
        "src/components/KeybindingsToast.browser.tsx",
      ],
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
        headless: true,
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
      // The @pierre/diffs WorkerPoolManager fires unhandled rejections when web
      // workers fail to initialize during teardown. This is benign in tests —
      // the diff rendering pool is not exercised by any browser test assertion.
      dangerouslyIgnoreUnhandledErrors: true,
    },
  }),
);
