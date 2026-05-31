import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contentScriptPath = fileURLToPath(new URL("../../dist/content/boot.js", import.meta.url));
const savedPath = "/Users/test/Downloads/Annotations-PNG/2026-05-25-1900-h1-capture1.png";

test.beforeEach(async ({ page }) => {
  test.skip(!existsSync(contentScriptPath), "Run bun run build before bun run e2e.");

  await page.addInitScript((imagePath) => {
    const browserWindow = window as any;
    const listeners: unknown[] = [];
    browserWindow.__lastAnnotationsRequest = null;
    browserWindow.__annotationsRequests = [];
    browserWindow.__annotationsStatusRequests = [];
    browserWindow.__annotationsStatusResponse = {
      ok: true,
      connected: true,
      reason: null,
      checkedAtEpochMs: 123,
      target: {
        subscriberId: "annotations-composer-e2e",
        threadId: "thread-e2e",
        threadTitle: "Integrar extensão ao Composer",
        clientKind: "desktop",
        activatedAtEpochMs: 100,
        lastSeenAtEpochMs: 120,
      },
    };
    browserWindow.__annotationsResponses = [];
    browserWindow.__emitAnnotationsRuntimeMessage = (message: unknown) => {
      listeners.forEach((listener) => {
        if (typeof listener === "function") listener(message);
      });
    };
    browserWindow.__blockTextClipboard = false;
    browserWindow.__clipboardText = "";
    browserWindow.__clipboardTextWrites = [];
    browserWindow.__clipboardImageWrites = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async write(items: unknown[]) {
          browserWindow.__clipboardImageWrites.push(items);
        },
        async writeText(text: string) {
          if (browserWindow.__blockTextClipboard) {
            throw new DOMException("Document is not focused.", "NotAllowedError");
          }
          browserWindow.__clipboardText = text;
          browserWindow.__clipboardTextWrites.push(text);
        },
      },
    });
    browserWindow.chrome = {
      runtime: {
        onMessage: {
          addListener(listener: unknown) {
            listeners.push(listener);
          },
          removeListener(listener: unknown) {
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
          },
        },
        async sendMessage(message: unknown) {
          if ((message as { type?: unknown })?.type === "ANNOTATIONS_T3_STATUS_REQUEST") {
            browserWindow.__annotationsStatusRequests.push(message);
            return browserWindow.__annotationsStatusResponse;
          }

          browserWindow.__lastAnnotationsRequest = message;
          browserWindow.__annotationsRequests.push(message);
          return (
            browserWindow.__annotationsResponses.shift() ?? {
              ok: true,
              markdownPrompt: defaultUiNote(imagePath, "teste e2e"),
              savedImage: {
                downloadId: 7,
                filename: imagePath,
                requestedFilename: "Annotations-PNG/2026-05-25-1900-h1-capture1.png",
                imageBytes: 1234,
                width: 960,
                height: 720,
              },
              diagnostics: [
                {
                  at: "2026-05-25T17:20:00.000Z",
                  scope: "background",
                  level: "info",
                  step: "download:complete",
                  message: "PNG saved and absolute filename confirmed.",
                },
              ],
            }
          );
        },
      },
    };

    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This function is serialized into the browser context.
    function defaultUiNote(path: string, comment: string) {
      return [
        "# UI Note",
        "",
        "## Prompt",
        "",
        comment,
        "",
        "## Informações",
        "",
        "Imagem:",
        `\`${path}\``,
        "",
        "URL:",
        "`https://example.test/simple-page.html`",
        "",
        "Elemento selecionado:",
        "`h1`",
        "",
        "Elemento no ponto:",
        "`h1 [h1]`",
        "",
        "Texto:",
        "`Ajuste fino de layout`",
        "",
        "Ponto:",
        "`x=250 y=142`",
        "",
        "Rect:",
        "`x=100 y=120 w=300 h=44 dpr=1`",
        "",
        "Pistas:",
        "`position=static; z-index=auto; transform=none`",
      ].join("\n");
    }
  }, savedPath);
});

test("toggles the persistent overlay and Pick mode separately", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_TOGGLE_OVERLAY__?.());

  const pickButton = page.getByRole("button", { name: "Pick" });
  await expect(pickButton).toBeVisible();
  await expect(pickButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("annotations-bridge-status")).toContainText(
    "T3 conectado: Integrar extensão ao Composer",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsStatusRequests.length))
    .toBeGreaterThan(0);
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeHidden();

  await pickButton.click();
  await expect(pickButton).toHaveAttribute("aria-pressed", "true");

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 8, box!.y + 8);
  await page.mouse.click(box!.x + 8, box!.y + 8);
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Debug" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Debug" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await pickButton.click();
  await expect(pickButton).toBeVisible();
  await expect(pickButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeHidden();

  await page.getByRole("button", { name: "Fechar overlay" }).click();
  await expect(pickButton).toBeHidden();
});

test("runtime toggle message opens the overlay, then toggles Pick without closing it", async ({
  page,
}) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });

  await page.evaluate(() => {
    (window as any).__emitAnnotationsRuntimeMessage({ type: "ANNOTATIONS_TOGGLE_OVERLAY" });
  });

  const pickButton = page.getByRole("button", { name: "Pick" });
  await expect(pickButton).toBeVisible();
  await expect(pickButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeHidden();

  await page.evaluate(() => {
    (window as any).__emitAnnotationsRuntimeMessage({ type: "ANNOTATIONS_TOGGLE_OVERLAY" });
  });

  await expect(pickButton).toBeVisible();
  await expect(pickButton).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => {
    (window as any).__emitAnnotationsRuntimeMessage({ type: "ANNOTATIONS_TOGGLE_OVERLAY" });
  });

  await expect(pickButton).toBeVisible();
  await expect(pickButton).toHaveAttribute("aria-pressed", "false");
});

test("blocks page pointer and click handlers while Pick is active", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.evaluate(() => {
    (window as any).__pagePointerDownCount = 0;
    (window as any).__pageClickCount = 0;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper runs inside page.evaluate.
    const isInsideCard = (event: MouseEvent | PointerEvent) => {
      const rect = document
        .querySelector('[data-shot-target="spacing-card"]')
        ?.getBoundingClientRect();
      return Boolean(
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom,
      );
    };
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (isInsideCard(event)) (window as any).__pagePointerDownCount += 1;
      },
      true,
    );
    document.addEventListener(
      "click",
      (event) => {
        if (isInsideCard(event)) (window as any).__pageClickCount += 1;
      },
      true,
    );
  });
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_TOGGLE_OVERLAY__?.());
  await page.getByRole("button", { name: "Pick" }).click();

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 8, box!.y + 8);
  await page.mouse.click(box!.x + 8, box!.y + 8);

  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__pagePointerDownCount)).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).__pageClickCount)).toBe(0);
});

test("selects an element, saves the PNG result and copies the UI Note text", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_START__?.());

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page
    .locator('textarea[aria-label="Comentário"]')
    .fill("Aumentar o respiro do cabecalho do card.");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length), {
      timeout: 2_000,
    })
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).__clipboardTextWrites.length), {
      timeout: 2_000,
    })
    .toBe(1);
  await expect(page.locator('section[aria-label="Nota não copiada"]')).toBeHidden({
    timeout: 2_000,
  });

  const clipboardText = await page.evaluate(() => (window as any).__clipboardText);
  expect(clipboardText).toContain("# UI Note");
  expect(clipboardText).toContain("Annotations-PNG");
  expect(clipboardText).toContain(savedPath);
  await expect
    .poll(() => page.evaluate(() => (window as any).__clipboardImageWrites.length))
    .toBe(0);

  const request = await page.evaluate(() => (window as any).__lastAnnotationsRequest);
  expect(request.type).toBe("ANNOTATIONS_CAPTURE_REQUEST");
  expect(request.payload.comment).toContain("respiro");
  expect(request.payload.debugMode).toBe(false);
  expect(request.payload.element.debug).toBeUndefined();
  expect(request.payload.element.shortSelector).toBe("h1");
  expect(request.payload.element.cssPath).toContain("article.card.primary");
  expect(request.payload.element.topElementAtPoint).toBeTruthy();
});

test("uses a successful T3 Composer delivery without writing the clipboard", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate((imagePath) => {
    (window as any).__annotationsResponses.push({
      ok: true,
      markdownPrompt: `# UI Note\n\n## Prompt\n\nenviar ao composer\n\n## Informações\n\nImagem:\n\`${imagePath}\``,
      savedImage: {
        downloadId: 7,
        filename: imagePath,
        requestedFilename: "Annotations-PNG/2026-05-25-1900-h1-capture1.png",
        imageBytes: 1234,
        width: 960,
        height: 720,
      },
      delivery: {
        ok: true,
        url: "http://127.0.0.1:3773/api/annotations/bridge/v1/deliver",
      },
    });
    window.__ANNOTATIONS_START__?.();
  }, savedPath);

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page.locator('textarea[aria-label="Comentário"]').fill("Enviar sem clipboard.");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length), {
      timeout: 2_000,
    })
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).__clipboardTextWrites.length), {
      timeout: 2_000,
    })
    .toBe(0);
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeHidden({ timeout: 2_000 });
});

test("adds debug metadata to the capture request when Debug is enabled", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_START__?.());

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 8, box!.y + 8);
  await page.mouse.click(box!.x + 8, box!.y + 8);

  const debugButton = page.getByRole("button", { name: "Debug" });
  await expect(debugButton).toBeVisible();
  await expect(debugButton).toHaveAttribute("aria-pressed", "false");
  await debugButton.click();
  await expect(debugButton).toHaveAttribute("aria-pressed", "true");

  await page
    .locator('textarea[aria-label="Comentário"]')
    .fill("Preciso debugar o layout deste card.");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length), {
      timeout: 2_000,
    })
    .toBe(1);
  const request = await page.evaluate(() => (window as any).__lastAnnotationsRequest);
  expect(request.payload.debugMode).toBe(true);
  expect(request.payload.element.debug.selectorMatches.cssPath).toBe(1);
  expect(request.payload.element.debug.attributes).toContainEqual({
    name: "data-shot-target",
    value: "spacing-card",
  });
  expect(request.payload.element.debug.computedStyles.display).toBeTruthy();
  expect(request.payload.element.debug.domPreview).toContain("spacing-card");
});

test("shows a manual fallback when writeText is blocked after the image is saved", async ({
  page,
}) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate((imagePath) => {
    (window as any).__blockTextClipboard = true;
    (window as any).__annotationsResponses.push({
      ok: true,
      markdownPrompt: `# UI Note\n\n## Prompt\n\nteste bloqueado\n\n## Informações\n\nImagem:\n\`${imagePath}\``,
      savedImage: {
        downloadId: 7,
        filename: imagePath,
        requestedFilename: "Annotations-PNG/2026-05-25-1900-h1-capture1.png",
        imageBytes: 1234,
        width: 960,
        height: 720,
      },
      diagnostics: [
        {
          at: "2026-05-25T17:20:00.000Z",
          scope: "background",
          level: "info",
          step: "download:complete",
          message: "PNG saved and absolute filename confirmed.",
        },
      ],
    });
    window.__ANNOTATIONS_START__?.();
  }, savedPath);

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page.locator('textarea[aria-label="Comentário"]').fill("clipboard bloqueado");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();

  const fallback = page.locator('section[aria-label="Nota não copiada"]');
  await expect(fallback).toBeVisible();
  await expect(
    page.getByText("A imagem foi salva, mas o Chrome bloqueou a cópia da nota."),
  ).toBeVisible();
  await expect(page.locator(".fallback-text")).toContainText(savedPath);
  await expect(page.locator(".fallback-diagnostics")).toContainText("clipboard:writeText:error");
  await expect(page.getByRole("button", { name: "Copiar PNG" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copiar texto" })).toHaveCount(0);
  await expect(page.locator(".fallback-image")).toHaveCount(0);
});

test("empty comments still prevent submission", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_START__?.());

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page.getByRole("button", { name: "Enviar ao T3" }).click();

  await expect(page.getByText("Escreva um comentário antes de capturar.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length))
    .toBe(0);
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeVisible();
});

test("successful copy can run twice after reinjection", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate((imagePath) => {
    (window as any).__annotationsResponses.push(
      {
        ok: true,
        markdownPrompt: `# UI Note\n\n## Prompt\n\nprimeira copia\n\n## Informações\n\nImagem:\n\`${imagePath}\``,
        savedImage: {
          downloadId: 7,
          filename: imagePath,
          requestedFilename: "Annotations-PNG/a.png",
          imageBytes: 1024,
          width: 960,
          height: 720,
        },
      },
      {
        ok: true,
        markdownPrompt: `# UI Note\n\n## Prompt\n\nsegunda copia\n\n## Informações\n\nImagem:\n\`${imagePath}\``,
        savedImage: {
          downloadId: 8,
          filename: imagePath,
          requestedFilename: "Annotations-PNG/b.png",
          imageBytes: 2048,
          width: 960,
          height: 720,
        },
      },
    );
    window.__ANNOTATIONS_START__?.();
  }, savedPath);

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page.locator('textarea[aria-label="Comentário"]').fill("primeira copia");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length), {
      timeout: 2_000,
    })
    .toBe(1);
  await expect(page.getByRole("button", { name: "Pick" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeHidden({ timeout: 2_000 });

  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_START__?.());
  await page.mouse.move(box!.x + 42, box!.y + 42);
  await page.mouse.click(box!.x + 42, box!.y + 42);
  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeVisible();
  await page.locator('textarea[aria-label="Comentário"]').fill("segunda copia");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length), {
      timeout: 2_000,
    })
    .toBe(2);

  const writes = await page.evaluate(() => (window as any).__clipboardTextWrites);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toContain("primeira copia");
  expect(writes[1]).toContain("segunda copia");

  const requests = await page.evaluate(() => (window as any).__annotationsRequests);
  expect(requests).toHaveLength(2);
  expect(requests[0].payload.comment).toBe("primeira copia");
  expect(requests[1].payload.comment).toBe("segunda copia");
});

test("copy and cancel buttons receive clicks inside the overlay", async ({ page }) => {
  await page.goto(new URL("../fixtures/simple-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_START__?.());

  const card = page.locator('[data-shot-target="spacing-card"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page.locator('textarea[aria-label="Comentário"]').fill("quero deixar maior.");
  await page.getByRole("button", { name: "Enviar ao T3" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).__annotationsRequests.length), {
      timeout: 2_000,
    })
    .toBe(1);
  const request = await page.evaluate(() => (window as any).__lastAnnotationsRequest);
  expect(request.type).toBe("ANNOTATIONS_CAPTURE_REQUEST");

  await page.evaluate(() => window.__ANNOTATIONS_START__?.());
  await page.mouse.move(box!.x + 32, box!.y + 32);
  await page.mouse.click(box!.x + 32, box!.y + 32);
  await page.getByRole("button", { name: "Cancelar" }).click();

  await expect(page.locator('textarea[aria-label="Comentário"]')).toBeHidden();
});

test("focus inside the comment box does not close an existing modal", async ({ page }) => {
  await page.goto(new URL("../fixtures/modal-page.html", import.meta.url).toString());
  await page.addScriptTag({ path: contentScriptPath });
  await page.evaluate(() => window.__ANNOTATIONS_START__?.());

  const target = page.locator('[data-shot-target="modal-button"]');
  const box = await target.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box!.x + 8, box!.y + 8);
  await page.mouse.click(box!.x + 8, box!.y + 8);
  await page
    .locator('textarea[aria-label="Comentário"]')
    .fill("Texto no modal ainda deve permanecer aberto.");

  await expect(page.locator('[data-testid="modal"]')).toBeVisible();
});
