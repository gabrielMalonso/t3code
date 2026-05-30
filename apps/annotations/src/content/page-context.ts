import { buildElementContext } from "../shared/metadata";
import type { CaptureRequest } from "../shared/types";

export function createCaptureRequest(
  element: Element,
  comment: string,
  options: { debugMode?: boolean; id?: string } = {},
): CaptureRequest {
  const debugMode = options.debugMode ?? false;

  return {
    id: options.id ?? createCaptureRequestId(),
    comment,
    element: buildElementContext(element, {
      debugMode,
      privacyMode: "redact-sensitive",
      url: window.location.href,
      title: document.title,
    }),
    privacyMode: "redact-sensitive",
    debugMode,
    createdAt: new Date().toISOString(),
  };
}

export function createCaptureRequestId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pns-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
