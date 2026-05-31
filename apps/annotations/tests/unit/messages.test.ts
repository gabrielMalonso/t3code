import { describe, expect, it } from "vitest";
import {
  isCaptureRequestMessage,
  isCaptureResult,
  isRenderImageResult,
  isRenderRequestMessage,
  isRuntimeMessage,
  isT3ComposerBridgeStatusResult,
  isT3StatusRequestMessage,
} from "../../src/shared/messages";
import type { CaptureRequest } from "../../src/shared/types";

const request: CaptureRequest = {
  id: "capture-1",
  comment: "ajustar espacamento",
  privacyMode: "redact-sensitive",
  debugMode: false,
  createdAt: "2026-05-25T19:00:00.000Z",
  element: {
    tagName: "div",
    id: null,
    classes: ["card"],
    shortSelector: "div.card",
    cssPath: "html:nth-of-type(1) > body:nth-of-type(1) > div.card:nth-of-type(1)",
    nthOfTypePath: "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1)",
    role: null,
    accessibleName: null,
    visibleText: "Resumo",
    visibleTextPreview: "Resumo",
    parentSummary: "body",
    siblingIndex: 0,
    similarSiblingCount: 1,
    boundingRect: { x: 10, y: 20, width: 100, height: 80 },
    viewport: {
      width: 1280,
      height: 720,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0,
      visualViewportOffsetLeft: 0,
      visualViewportOffsetTop: 0,
      visualViewportScale: 1,
    },
    url: "https://example.com",
    pageTitle: "Example",
    usefulStyles: {
      position: "static",
      zIndex: "auto",
      display: "block",
      visibility: "visible",
      opacity: "1",
      transform: "none",
      pointerEvents: "auto",
      overflow: "visible",
      isolation: "auto",
    },
    topElementAtPoint: {
      x: 60,
      y: 60,
      label: "div.card",
      shortSelector: "div.card",
    },
  },
};

describe("message guards", () => {
  it("recognizes capture and render messages", () => {
    expect(isRuntimeMessage({ type: "ANNOTATIONS_START_PICKING" })).toBe(true);
    expect(isCaptureRequestMessage({ type: "ANNOTATIONS_CAPTURE_REQUEST", payload: request })).toBe(
      true,
    );
    expect(
      isRenderRequestMessage({
        type: "ANNOTATIONS_RENDER_REQUEST",
        payload: { request, screenshotDataUrl: "data:image/png;base64,abc" },
      }),
    ).toBe(true);
    expect(
      isT3StatusRequestMessage({
        type: "ANNOTATIONS_T3_STATUS_REQUEST",
        requestId: "annotations-test",
        reason: "overlay-open",
      }),
    ).toBe(true);
  });

  it("normalizes older capture requests without debug mode", () => {
    const olderRequest = { ...request } as Partial<CaptureRequest>;
    delete olderRequest.debugMode;
    const message = { type: "ANNOTATIONS_CAPTURE_REQUEST", payload: olderRequest };

    expect(isCaptureRequestMessage(message)).toBe(true);
    expect(message.payload.debugMode).toBe(false);
  });

  it("recognizes capture and render results", () => {
    expect(
      isCaptureResult({
        ok: true,
        markdownPrompt: "# UI Note",
        savedImage: {
          downloadId: 7,
          filename: "/Users/test/Downloads/Annotations-PNG/file.png",
          requestedFilename: "Annotations-PNG/file.png",
          imageBytes: 123,
          width: 800,
          height: 600,
        },
        delivery: {
          ok: true,
          url: "http://127.0.0.1:3773/api/annotations/bridge/v1/deliver",
        },
      }),
    ).toBe(true);
    expect(
      isRenderImageResult({
        ok: true,
        imageDataUrl: "data:image/png;base64,abc",
        imageBytes: 123,
        width: 800,
        height: 600,
      }),
    ).toBe(true);
    expect(
      isCaptureResult({
        ok: false,
        reason: "download-failed",
        fallback: { markdownPrompt: "# UI Note" },
      }),
    ).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(isRuntimeMessage({ type: "OTHER" })).toBe(false);
    expect(
      isCaptureRequestMessage({ type: "ANNOTATIONS_CAPTURE_REQUEST", payload: { id: "x" } }),
    ).toBe(false);
    expect(
      isCaptureRequestMessage({
        type: "ANNOTATIONS_CAPTURE_REQUEST",
        payload: { ...request, debugMode: "true" },
      }),
    ).toBe(false);
    expect(
      isRenderRequestMessage({ type: "ANNOTATIONS_RENDER_REQUEST", payload: { request } }),
    ).toBe(false);
    expect(isCaptureResult({ ok: true, copied: true })).toBe(false);
    expect(
      isCaptureResult({
        ok: true,
        markdownPrompt: "# UI Note",
        savedImage: {
          downloadId: 7,
          filename: "/Users/test/Downloads/Annotations-PNG/file.png",
          requestedFilename: "Annotations-PNG/file.png",
          imageBytes: 123,
          width: 800,
          height: 600,
        },
        delivery: { ok: true },
      }),
    ).toBe(false);
    expect(
      isRenderImageResult({
        ok: false,
        reason: "not-real",
        fallback: { markdownPrompt: "# UI Note" },
      }),
    ).toBe(false);
  });

  it("recognizes T3 Composer bridge status responses", () => {
    expect(
      isT3ComposerBridgeStatusResult({
        ok: true,
        connected: true,
        reason: null,
        checkedAtEpochMs: 123,
        target: {
          subscriberId: "annotations-composer-test",
          threadId: "thread-test",
          threadTitle: "Integrar extensão ao Composer",
          clientKind: "desktop",
          activatedAtEpochMs: 100,
          lastSeenAtEpochMs: 120,
        },
      }),
    ).toBe(true);
    expect(
      isT3ComposerBridgeStatusResult({
        ok: true,
        connected: false,
        reason: "composer-not-connected",
        checkedAtEpochMs: 123,
        target: null,
      }),
    ).toBe(true);
    expect(isT3ComposerBridgeStatusResult({ ok: false, reason: "app-unreachable" })).toBe(true);
    expect(
      isT3ComposerBridgeStatusResult({ ok: true, connected: true, reason: null, target: null }),
    ).toBe(false);
    expect(
      isT3StatusRequestMessage({ type: "ANNOTATIONS_T3_STATUS_REQUEST", requestId: 123 }),
    ).toBe(false);
  });
});
