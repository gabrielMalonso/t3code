import { appendDiagnostic, errorDiagnostic, makeDiagnostic } from "../shared/diagnostics";
import {
  buildDownloadFilename,
  downloadRenderedPng,
  getConfiguredDownloadFolder,
} from "./downloads";
import { deliverToT3Composer, readT3ComposerStatus } from "./t3-composer";
import { errorMessage, toCaptureFailureReason } from "../shared/errors";
import {
  isCaptureRequestMessage,
  isRenderImageResult,
  isT3StatusRequestMessage,
  MESSAGE_TYPES,
} from "../shared/messages";
import { redactAndTruncate } from "../shared/privacy";
import type {
  CaptureRequest,
  CaptureResult,
  DiagnosticLogEntry,
  RenderImageResult,
  RenderRequestMessage,
  T3ComposerBridgeStatusResult,
} from "../shared/types";
import { buildUiNote } from "../shared/ui-note";

const OFFSCREEN_PATH = "offscreen/offscreen.html";
let creatingOffscreen: Promise<void> | null = null;

type T3Diagnostic = {
  level: "info" | "warn";
  step: string;
  message: string;
  details: Record<string, unknown>;
};

type RuntimeWithContexts = typeof chrome.runtime & {
  getContexts?: (filter: {
    contextTypes?: string[];
    documentUrls?: string[];
  }) => Promise<unknown[]>;
};

chrome.action.onClicked.addListener((tab) => {
  void activateTab(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-annotations") return;
  void activateCurrentTab();
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isT3StatusRequestMessage(message)) {
    void readT3ComposerStatus({
      requestId: message.requestId,
      reason: message.reason ?? "runtime-status-request",
    })
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          reason: "t3-status-failed",
          message: errorMessage(error),
        }),
      );
    return true;
  }

  if (!isCaptureRequestMessage(message)) return false;

  void handleCapture(message.payload, sender)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse(failureResult(message.payload, error, [])));

  return true;
});

async function activateCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await activateTab(tab);
}

async function activateTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;

  if (isRestrictedUrl(tab.url)) {
    await markTabBlocked(tab.id, "Página restrita");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/boot.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.toggleOverlay });
    await clearTabBadge(tab.id);
  } catch (error) {
    console.warn("[Annotations] activation failed", error);
    await markTabBlocked(tab.id, "Não foi possível ativar");
  }
}

async function handleCapture(
  request: CaptureRequest,
  sender: chrome.runtime.MessageSender,
): Promise<CaptureResult> {
  let diagnostics: DiagnosticLogEntry[] = [];

  try {
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic("background", "info", "capture:start", "Capture request received.", {
        requestId: request.id,
        selector: redactAndTruncate(request.element.shortSelector, 220),
        tabId: sender.tab?.id ?? null,
        windowId: sender.tab?.windowId ?? null,
      }),
    );

    const preflight = await readT3ComposerStatus(
      { requestId: request.id, reason: "capture-preflight" },
      undefined,
      (diagnostic) => {
        diagnostics = appendT3Diagnostic(diagnostics, diagnostic);
      },
    );
    const preflightConnected = isT3BridgeConnected(preflight);
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic(
        "background",
        preflightConnected ? "info" : "warn",
        "t3:preflight",
        preflightConnected
          ? "T3 Composer bridge target is connected before capture."
          : "T3 Composer bridge target is not connected before capture.",
        { requestId: request.id, ...t3BridgeStatusDetails(preflight) },
      ),
    );

    const screenshotDataUrl = await captureVisibleTab(sender.tab?.windowId);
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic(
        "background",
        "info",
        "capture:visible-tab",
        "Visible tab screenshot captured.",
        {
          requestId: request.id,
          dataUrlBytes: screenshotDataUrl.length,
        },
      ),
    );

    await closeOffscreenDocument();
    await ensureOffscreenDocument();
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic("background", "info", "offscreen:ready", "Offscreen document ready.", {
        requestId: request.id,
      }),
    );

    const renderMessage: RenderRequestMessage = {
      type: MESSAGE_TYPES.renderRequest,
      payload: { request, screenshotDataUrl, diagnostics },
    };

    const renderResult = (await withTimeout(
      chrome.runtime.sendMessage(renderMessage),
      8_000,
      "render-failed: offscreen render timed out",
    )) as RenderImageResult | undefined;

    if (!renderResult) throw new Error("render-failed: offscreen document returned no result");
    if (!isRenderImageResult(renderResult))
      throw new Error("render-failed: offscreen document returned malformed result");

    if (!renderResult.ok) {
      return {
        ...renderResult,
        diagnostics: renderResult.fallback.diagnostics,
        fallback: {
          ...renderResult.fallback,
          diagnostics: renderResult.fallback.diagnostics ?? diagnostics,
        },
      };
    }

    diagnostics = renderResult.diagnostics ?? diagnostics;
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic("background", "info", "download:start", "Saving rendered PNG to Downloads.", {
        requestId: request.id,
        imageBytes: renderResult.imageBytes,
        dataUrlBytes: renderResult.imageDataUrl.length,
      }),
    );

    const requestedFilename = buildDownloadFilename(request, {
      folder: await getConfiguredDownloadFolder(),
    });
    const savedImage = await downloadRenderedPng({
      imageDataUrl: renderResult.imageDataUrl,
      requestedFilename,
      imageBytes: renderResult.imageBytes,
      width: renderResult.width,
      height: renderResult.height,
    });
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic(
        "background",
        "info",
        "download:complete",
        "PNG saved and absolute filename confirmed.",
        {
          requestId: request.id,
          downloadId: savedImage.downloadId,
          requestedFilename: savedImage.requestedFilename,
          filename: savedImage.filename,
        },
      ),
    );

    const markdownPrompt = buildUiNote(request, { imagePath: savedImage.filename });
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic("background", "info", "t3:deliver:start", "Sending UI Note to T3 Composer.", {
        requestId: request.id,
        filename: savedImage.filename,
      }),
    );
    const delivery = await deliverToT3Composer(
      { markdownPrompt, savedImage, requestId: request.id },
      undefined,
      (diagnostic) => {
        diagnostics = appendT3Diagnostic(diagnostics, diagnostic);
      },
    );
    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic(
        "background",
        delivery.ok ? "info" : "warn",
        delivery.ok ? "t3:deliver:complete" : "t3:deliver:failed",
        delivery.ok
          ? "UI Note delivered to T3 Composer."
          : "Could not deliver UI Note to T3 Composer.",
        delivery.ok
          ? { requestId: request.id, url: delivery.url }
          : { requestId: request.id, reason: delivery.reason, message: delivery.message ?? null },
      ),
    );

    return {
      ok: true,
      markdownPrompt,
      savedImage,
      delivery,
      diagnostics,
    };
  } catch (error) {
    diagnostics = appendDiagnostic(
      diagnostics,
      errorDiagnostic("background", "capture:error", error, { requestId: request.id }),
    );
    return failureResult(request, error, diagnostics);
  } finally {
    await closeOffscreenDocument();
  }
}

function isT3BridgeConnected(status: T3ComposerBridgeStatusResult): boolean {
  return status.ok && status.connected;
}

function t3BridgeStatusDetails(status: T3ComposerBridgeStatusResult): Record<string, unknown> {
  if (!status.ok) {
    return {
      ok: false,
      reason: status.reason,
      message: status.message ?? null,
    };
  }

  return {
    ok: true,
    connected: status.connected,
    reason: status.reason,
    targetThreadId: status.target?.threadId ?? null,
    targetThreadTitle: status.target?.threadTitle ?? null,
    targetClientKind: status.target?.clientKind ?? null,
    targetLastSeenAtEpochMs: status.target?.lastSeenAtEpochMs ?? null,
  };
}

function appendT3Diagnostic(
  entries: DiagnosticLogEntry[],
  diagnostic: T3Diagnostic,
): DiagnosticLogEntry[] {
  return appendDiagnostic(
    entries,
    makeDiagnostic(
      "background",
      diagnostic.level,
      `t3:${diagnostic.step}`,
      diagnostic.message,
      diagnostic.details,
    ),
  );
}

function captureVisibleTab(windowId: number | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const callback = (dataUrl?: string) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(`capture-failed: ${error.message}`));
        return;
      }

      if (!dataUrl) {
        reject(new Error("capture-failed: empty screenshot"));
        return;
      }

      resolve(dataUrl);
    };

    if (typeof windowId === "number") {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, callback);
      return;
    }

    chrome.tabs.captureVisibleTab({ format: "png" }, callback);
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await getOffscreenContexts();
  if (contexts && contexts.length > 0) return;

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["BLOBS" as chrome.offscreen.Reason],
        justification: "Compose Annotations PNG crops locally before saving them.",
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }

  await creatingOffscreen;
}

async function closeOffscreenDocument(): Promise<void> {
  const contexts = await getOffscreenContexts();
  if (!contexts || contexts.length === 0) return;

  try {
    await chrome.offscreen.closeDocument();
  } catch (error) {
    console.warn("[Annotations] could not close offscreen document", error);
  }
}

async function getOffscreenContexts(): Promise<unknown[] | undefined> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const runtimeWithContexts = chrome.runtime as RuntimeWithContexts;

  return runtimeWithContexts.getContexts?.({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function failureResult(
  request: CaptureRequest,
  error: unknown,
  diagnostics: DiagnosticLogEntry[],
): CaptureResult {
  const reason = toCaptureFailureReason(error);
  return {
    ok: false,
    reason,
    fallback: {
      markdownPrompt: buildUiNote(request),
      diagnostics,
    },
  };
}

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return (
    /^(chrome|chrome-extension|edge|about):/i.test(url) ||
    /^https:\/\/chromewebstore\.google\.com\//i.test(url)
  );
}

async function markTabBlocked(tabId: number, title: string): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: "!" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#ff2f9c" });
  await chrome.action.setTitle({ tabId, title: `Annotations: ${title}` });
}

async function clearTabBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: "" });
  await chrome.action.setTitle({ tabId, title: "Annotations" });
}
