import type {
  CaptureResult,
  CaptureRequest,
  AnnotationsMessage,
  RenderImageResult,
  RenderRequestMessage,
  RuntimeMessage,
  T3ComposerBridgeStatusResult,
} from "./types";

export const MESSAGE_TYPES = {
  toggleOverlay: "ANNOTATIONS_TOGGLE_OVERLAY",
  startPicking: "ANNOTATIONS_START_PICKING",
  cancel: "ANNOTATIONS_CANCEL",
  captureRequest: "ANNOTATIONS_CAPTURE_REQUEST",
  captureDone: "ANNOTATIONS_CAPTURE_DONE",
  captureFailed: "ANNOTATIONS_CAPTURE_FAILED",
  t3StatusRequest: "ANNOTATIONS_T3_STATUS_REQUEST",
  renderRequest: "ANNOTATIONS_RENDER_REQUEST",
} as const;

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return isRecord(value) && typeof value.type === "string" && value.type.startsWith("ANNOTATIONS_");
}

export function isCaptureRequestMessage(
  value: unknown,
): value is Extract<AnnotationsMessage, { type: "ANNOTATIONS_CAPTURE_REQUEST" }> {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPES.captureRequest &&
    isCaptureRequest(value.payload)
  );
}

export function isT3StatusRequestMessage(
  value: unknown,
): value is Extract<AnnotationsMessage, { type: "ANNOTATIONS_T3_STATUS_REQUEST" }> {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPES.t3StatusRequest &&
    (value.requestId === undefined || typeof value.requestId === "string") &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

export function isRenderRequestMessage(value: unknown): value is RenderRequestMessage {
  if (!isRecord(value) || value.type !== MESSAGE_TYPES.renderRequest || !isRecord(value.payload))
    return false;
  return (
    typeof value.payload.screenshotDataUrl === "string" && isCaptureRequest(value.payload.request)
  );
}

export function isCaptureResult(value: unknown): value is CaptureResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;

  if (value.ok === true) {
    return (
      typeof value.markdownPrompt === "string" &&
      isSavedImage(value.savedImage) &&
      isT3ComposerDeliveryResult(value.delivery)
    );
  }

  return isCaptureFailureReason(value.reason) && isCaptureFallback(value.fallback);
}

export function isRenderImageResult(value: unknown): value is RenderImageResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;

  if (value.ok === true) {
    return (
      typeof value.imageDataUrl === "string" &&
      typeof value.imageBytes === "number" &&
      typeof value.width === "number" &&
      typeof value.height === "number"
    );
  }

  return isCaptureFailureReason(value.reason) && isCaptureFallback(value.fallback);
}

function isCaptureRequest(value: unknown): value is CaptureRequest {
  if (!isRecord(value)) return false;

  const hasRequiredFields =
    typeof value.id === "string" &&
    typeof value.comment === "string" &&
    (value.privacyMode === "normal" || value.privacyMode === "redact-sensitive") &&
    (value.debugMode === undefined || typeof value.debugMode === "boolean") &&
    typeof value.createdAt === "string" &&
    isRecord(value.element);

  if (!hasRequiredFields) return false;

  if (value.debugMode === undefined) {
    value.debugMode = false;
  }

  return true;
}

function isCaptureFallback(value: unknown): boolean {
  return isRecord(value) && typeof value.markdownPrompt === "string";
}

function isSavedImage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.downloadId === "number" &&
    typeof value.filename === "string" &&
    typeof value.requestedFilename === "string" &&
    typeof value.imageBytes === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isT3ComposerDeliveryResult(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok === true) {
    return (
      (value.requestId === undefined || typeof value.requestId === "string") &&
      (typeof value.tabId === "number" || value.tabId === null) &&
      (typeof value.url === "string" || value.url === null)
    );
  }
  return (
    (value.requestId === undefined || typeof value.requestId === "string") &&
    typeof value.reason === "string" &&
    (value.message === undefined || typeof value.message === "string")
  );
}

export function isT3ComposerBridgeStatusResult(
  value: unknown,
): value is T3ComposerBridgeStatusResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;

  if (value.ok === false) {
    return (
      typeof value.reason === "string" &&
      (value.message === undefined || typeof value.message === "string")
    );
  }

  return (
    typeof value.connected === "boolean" &&
    (value.reason === "composer-not-connected" || value.reason === null) &&
    typeof value.checkedAtEpochMs === "number" &&
    (value.target === null || isT3ComposerBridgeStatusTarget(value.target))
  );
}

function isT3ComposerBridgeStatusTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.subscriberId === "string" &&
    typeof value.threadId === "string" &&
    (typeof value.threadTitle === "string" || value.threadTitle === null) &&
    (value.clientKind === "browser" || value.clientKind === "desktop") &&
    typeof value.activatedAtEpochMs === "number" &&
    typeof value.lastSeenAtEpochMs === "number"
  );
}

function isCaptureFailureReason(value: unknown): boolean {
  return (
    value === "capture-failed" ||
    value === "render-failed" ||
    value === "download-failed" ||
    value === "clipboard-blocked" ||
    value === "restricted-page" ||
    value === "offscreen-unavailable" ||
    value === "unknown"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
