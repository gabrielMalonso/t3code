import { chromium, expect, test } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionPath = fileURLToPath(new URL("../../dist", import.meta.url));
const manifestPath = fileURLToPath(new URL("../../dist/manifest.json", import.meta.url));

test("loads the unpacked extension service worker", async () => {
  test.skip(!existsSync(manifestPath), "Run bun run build before bun run e2e.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    action?: {
      default_icon?: Record<string, string>;
    };
    host_permissions?: string[];
    icons?: Record<string, string>;
  };
  expect(manifest.host_permissions).toContain("<all_urls>");
  expect(manifest.icons?.["128"]).toBe("icons/favicon.png");
  expect(manifest.action?.default_icon?.["32"]).toBe("icons/favicon.png");

  const userDataDir = mkdtempSync(join(tmpdir(), "annotations-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");

    expect(serviceWorker.url()).toContain("/background/service-worker.js");
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
