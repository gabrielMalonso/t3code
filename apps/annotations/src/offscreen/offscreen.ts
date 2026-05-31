import { appendDiagnostic, errorDiagnostic, makeDiagnostic } from "../shared/diagnostics";
import { clipboardCapabilityDetails } from "../shared/clipboard-diagnostics";
import { toCaptureFailureReason } from "../shared/errors";
import { isRenderRequestMessage } from "../shared/messages";
import { renderHighlightedPng } from "../shared/render-png";
import type { DiagnosticLogEntry, RenderImageResult, RenderRequestMessage } from "../shared/types";
import { buildUiNote } from "../shared/ui-note";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRenderRequestMessage(message)) return false;

  void handleRender(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const request = message.payload.request;
      const diagnostics = [
        ...(message.payload.diagnostics ?? []),
        errorDiagnostic("offscreen", "render:unhandled-error", error, clipboardCapabilityDetails()),
      ];
      sendResponse({
        ok: false,
        reason: toCaptureFailureReason(error),
        fallback: {
          markdownPrompt: buildUiNote(request),
          diagnostics,
        },
      } satisfies RenderImageResult);
    });

  return true;
});

async function handleRender(message: RenderRequestMessage): Promise<RenderImageResult> {
  const { request, screenshotDataUrl } = message.payload;
  let diagnostics: DiagnosticLogEntry[] = message.payload.diagnostics ?? [];

  diagnostics = appendDiagnostic(
    diagnostics,
    makeDiagnostic("offscreen", "info", "render:start", "Offscreen render request received.", {
      requestId: request.id,
      screenshotDataUrlBytes: screenshotDataUrl.length,
      ...clipboardCapabilityDetails(),
    }),
  );

  const rendered = await renderHighlightedPng({ request, screenshotDataUrl });
  diagnostics = appendDiagnostic(
    diagnostics,
    makeDiagnostic("offscreen", "info", "render:png", "Contextual PNG crop rendered.", {
      requestId: request.id,
      imageBytes: rendered.imageBytes,
      width: rendered.width,
      height: rendered.height,
      blobType: rendered.blob.type,
    }),
  );

  return {
    ok: true,
    imageDataUrl: rendered.dataUrl,
    imageBytes: rendered.imageBytes,
    width: rendered.width,
    height: rendered.height,
    diagnostics,
  };
}
