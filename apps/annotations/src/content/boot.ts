import {
  hideBadge,
  hideFallback,
  hideHud,
  hidePanel,
  renderOverlayChrome,
  setBridgeStatus,
  setCapturing,
  setDebugMode,
  setPageInteractionBlocked,
  setPickActive,
  showBadge,
  showFallback,
  showHud,
  showPanel,
  showToast,
  type BridgeStatusPresentation,
  type OverlayRefs,
} from "./annotation-overlay";
import { createCaptureRequest, createCaptureRequestId } from "./page-context";
import {
  createAnnotationsShadowRoot,
  isAnnotationsEvent,
  ROOT_ID,
  stopHostilePageHandlers,
} from "./shadow-root";
import { elementLabel, elementRect, findPickTarget, placeFixedBox } from "./selector-overlay";
import { clipboardCapabilityDetails } from "../shared/clipboard-diagnostics";
import { COPY } from "../shared/copy";
import { appendDiagnostic, errorDiagnostic, makeDiagnostic } from "../shared/diagnostics";
import { errorMessage } from "../shared/errors";
import { isT3ComposerBridgeStatusResult, MESSAGE_TYPES } from "../shared/messages";
import type {
  CaptureFallback,
  CaptureResult,
  DiagnosticLogEntry,
  T3ComposerBridgeStatusResult,
  T3ComposerDeliveryResult,
} from "../shared/types";
import { buildMinimalUiNote, buildUiNote } from "../shared/ui-note";

type AnnotationsState = "idle" | "picking" | "locked" | "capturing" | "fallback";
const CONTROLLER_VERSION = "0.4.0";
const RECENT_DELIVERY_STATUS_GRACE_MS = 120_000;
const BLOCKED_INTERACTION_EVENTS = [
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "contextmenu",
] as const;
type SuccessfulDelivery = Extract<T3ComposerDeliveryResult, { ok: true }>;

declare global {
  interface Window {
    __annotationsController?: AnnotationsController;
    __annotationsControllerVersion?: string;
    __annotationsRuntimeListener?: (message: unknown) => void;
    __ANNOTATIONS_START__?: () => void;
    __ANNOTATIONS_TOGGLE_OVERLAY__?: () => void;
  }
}

class AnnotationsController {
  private readonly refs: OverlayRefs;
  private state: AnnotationsState = "idle";
  private overlayVisible = false;
  private hoveredElement: Element | null = null;
  private selectedElement: Element | null = null;
  private listenersAttached = false;
  private debugMode = false;
  private bridgeStatusRefreshSeq = 0;
  private lastSuccessfulDelivery: { atEpochMs: number; delivery: SuccessfulDelivery } | null = null;

  constructor() {
    const { host, shadow } = createAnnotationsShadowRoot();
    this.refs = renderOverlayChrome(shadow);
    stopHostilePageHandlers(this.refs.eventShield);
    stopHostilePageHandlers(this.refs.hud);
    stopHostilePageHandlers(this.refs.panel);
    stopHostilePageHandlers(this.refs.fallback);

    this.refs.eventShield.addEventListener("pointermove", this.handleShieldPointerMove);
    this.refs.eventShield.addEventListener("pointerdown", this.handleShieldPointerDown);
    for (const eventName of BLOCKED_INTERACTION_EVENTS) {
      this.refs.eventShield.addEventListener(eventName, this.handleShieldBlockedEvent);
    }
    this.refs.hudPickButton.addEventListener("click", () => this.togglePick());
    this.refs.hudCloseButton.addEventListener("click", () => this.hideOverlay());
    this.refs.debugButton.addEventListener("click", () => this.toggleDebugMode());
    this.refs.primaryButton.addEventListener("click", () => void this.submit());
    this.refs.secondaryButton.addEventListener("click", () => this.cancel());
    this.refs.textarea.addEventListener("keydown", (event) => this.handleTextareaKeyDown(event));
    host.style.display = "none";
  }

  start(): void {
    this.startPicking();
  }

  toggleOverlay(): void {
    if (!this.overlayVisible) {
      this.showOverlay();
      return;
    }

    this.togglePick();
  }

  showOverlay(): void {
    this.overlayVisible = true;
    this.refs.host.style.display = "block";
    this.refs.host.style.visibility = "visible";
    showHud(this.refs);
    setPickActive(this.refs, this.state !== "idle");
    setPageInteractionBlocked(this.refs, this.state !== "idle");
    this.attachListeners();
    void this.refreshBridgeStatus("overlay-open");
  }

  hideOverlay(): void {
    this.stopPicking({ keepOverlay: false });
  }

  cancel(): void {
    this.stopPicking({ keepOverlay: true });
  }

  destroy(): void {
    this.hideOverlay();
    this.refs.host.remove();
  }

  private startPicking(): void {
    if (this.state === "capturing") return;

    this.showOverlay();
    this.attachListeners();
    this.state = "picking";
    this.setDebugMode(false);
    this.hoveredElement = null;
    this.selectedElement = null;
    this.refs.host.style.display = "block";
    this.refs.host.style.visibility = "visible";
    setPickActive(this.refs, true);
    setPageInteractionBlocked(this.refs, true);
    hidePanel(this.refs);
    hideFallback(this.refs);
    hideBadge(this.refs);
    placeFixedBox(this.refs.hoverBox, { x: 0, y: 0, width: 0, height: 0 }, false);
    placeFixedBox(this.refs.lockedBox, { x: 0, y: 0, width: 0, height: 0 }, false);
    showToast(this.refs, COPY.selectHint, 1600);
  }

  private togglePick(): void {
    if (this.state === "capturing") return;

    if (this.state === "idle") {
      this.startPicking();
      return;
    }

    this.cancel();
  }

  private stopPicking({ keepOverlay }: { keepOverlay: boolean }): void {
    this.state = "idle";
    this.hoveredElement = null;
    this.selectedElement = null;
    this.setDebugMode(false);
    this.refs.textarea.value = "";
    this.refs.host.style.visibility = "visible";
    setCapturing(this.refs, false);
    setPickActive(this.refs, false);
    setPageInteractionBlocked(this.refs, false);
    hidePanel(this.refs);
    hideFallback(this.refs);
    hideBadge(this.refs);
    placeFixedBox(this.refs.hoverBox, { x: 0, y: 0, width: 0, height: 0 }, false);
    placeFixedBox(this.refs.lockedBox, { x: 0, y: 0, width: 0, height: 0 }, false);

    if (keepOverlay) {
      this.overlayVisible = true;
      this.refs.host.style.display = "block";
      showHud(this.refs);
      this.attachListeners();
      return;
    }

    this.overlayVisible = false;
    hideHud(this.refs);
    this.refs.host.style.display = "none";
    this.detachListeners();
  }

  private attachListeners(): void {
    if (this.listenersAttached) return;
    window.addEventListener("pointermove", this.handlePagePointerMove, true);
    window.addEventListener("pointerdown", this.handlePagePointerDown, true);
    for (const eventName of BLOCKED_INTERACTION_EVENTS) {
      window.addEventListener(eventName, this.handlePageBlockedEvent, true);
    }
    document.addEventListener("pointermove", this.handlePointerMove, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    window.addEventListener("scroll", this.reposition, true);
    window.addEventListener("resize", this.reposition, true);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;
    window.removeEventListener("pointermove", this.handlePagePointerMove, true);
    window.removeEventListener("pointerdown", this.handlePagePointerDown, true);
    for (const eventName of BLOCKED_INTERACTION_EVENTS) {
      window.removeEventListener(eventName, this.handlePageBlockedEvent, true);
    }
    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    window.removeEventListener("scroll", this.reposition, true);
    window.removeEventListener("resize", this.reposition, true);
    this.listenersAttached = false;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.state !== "picking" || isAnnotationsEvent(event, this.refs.host)) return;

    const target = this.findPickTargetAt(event.clientX, event.clientY);
    if (!target || target === this.hoveredElement) return;

    this.hoveredElement = target;
    const rect = elementRect(target);
    placeFixedBox(this.refs.hoverBox, rect, true);
    showBadge(this.refs, elementLabel(target), rect);
  };

  private readonly handleShieldPointerMove = (event: PointerEvent): void => {
    if (this.state !== "picking") return;
    this.updateHoveredTarget(event.clientX, event.clientY);
    this.blockPageEvent(event);
  };

  private readonly handleShieldPointerDown = (event: PointerEvent): void => {
    this.handlePickPointerDown(event);
  };

  private readonly handleShieldBlockedEvent = (event: Event): void => {
    if (this.state === "idle") return;
    this.blockPageEvent(event);
  };

  private readonly handlePagePointerMove = (event: PointerEvent): void => {
    if (this.state === "idle" || this.isOverlayControlEvent(event)) return;
    if (this.state === "picking") this.updateHoveredTarget(event.clientX, event.clientY);
    this.blockPageEvent(event);
  };

  private readonly handlePagePointerDown = (event: PointerEvent): void => {
    if (this.state === "idle" || this.isOverlayControlEvent(event)) return;
    this.handlePickPointerDown(event);
  };

  private readonly handlePageBlockedEvent = (event: Event): void => {
    if (this.state === "idle" || this.isOverlayControlEvent(event)) return;
    this.blockPageEvent(event);
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.state !== "picking" || isAnnotationsEvent(event, this.refs.host)) return;

    const target = this.hoveredElement ?? this.findPickTargetAt(event.clientX, event.clientY);
    if (!target) return;

    this.blockPageEvent(event);
    this.lockElement(target);
  };

  private handlePickPointerDown(event: PointerEvent): void {
    this.blockPageEvent(event);
    if (this.state !== "picking" || event.button !== 0) return;

    const target = this.hoveredElement ?? this.findPickTargetAt(event.clientX, event.clientY);
    if (target) this.lockElement(target);
  }

  private updateHoveredTarget(clientX: number, clientY: number): void {
    const target = this.findPickTargetAt(clientX, clientY);
    if (!target || target === this.hoveredElement) return;

    this.hoveredElement = target;
    const rect = elementRect(target);
    placeFixedBox(this.refs.hoverBox, rect, true);
    showBadge(this.refs, elementLabel(target), rect);
  }

  private findPickTargetAt(clientX: number, clientY: number): Element | null {
    const previousPointerEvents = this.refs.eventShield.style.pointerEvents;
    this.refs.eventShield.style.pointerEvents = "none";
    try {
      return findPickTarget(clientX, clientY, this.refs.host);
    } finally {
      this.refs.eventShield.style.pointerEvents = previousPointerEvents;
    }
  }

  private blockPageEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private isOverlayControlEvent(event: Event): boolean {
    const path = event.composedPath();
    return path.includes(this.refs.host) && !path.includes(this.refs.eventShield);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.state !== "idle") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }

    if (event.key === "Escape" && this.overlayVisible) {
      event.preventDefault();
      event.stopPropagation();
      this.hideOverlay();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && this.state === "locked") {
      event.preventDefault();
      void this.submit();
    }
  };

  private handleTextareaKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void this.submit();
      return;
    }

    if (event.key === "Backspace" && this.refs.textarea.value.length === 0) {
      event.preventDefault();
      this.reselect();
    }
  }

  private toggleDebugMode(): void {
    if (this.state !== "locked") return;
    this.setDebugMode(!this.debugMode);
  }

  private setDebugMode(active: boolean): void {
    this.debugMode = active;
    setDebugMode(this.refs, active);
  }

  private lockElement(element: Element): void {
    this.state = "locked";
    this.setDebugMode(false);
    setPickActive(this.refs, true);
    setPageInteractionBlocked(this.refs, true);
    this.selectedElement = element;
    this.hoveredElement = null;
    this.refs.textarea.value = "";
    placeFixedBox(this.refs.hoverBox, { x: 0, y: 0, width: 0, height: 0 }, false);
    this.reposition();
    showPanel(this.refs, elementRect(element));
    this.refs.textarea.focus();
  }

  private reselect(): void {
    this.state = "picking";
    setPickActive(this.refs, true);
    setPageInteractionBlocked(this.refs, true);
    this.selectedElement = null;
    this.refs.textarea.value = "";
    hidePanel(this.refs);
    placeFixedBox(this.refs.lockedBox, { x: 0, y: 0, width: 0, height: 0 }, false);
    showToast(this.refs, COPY.selectHint, 1200);
  }

  private readonly reposition = (): void => {
    const element = this.selectedElement ?? this.hoveredElement;
    if (!element || this.state === "capturing") return;

    const rect = elementRect(element);
    showBadge(this.refs, elementLabel(element), rect);

    if (this.selectedElement) {
      placeFixedBox(this.refs.lockedBox, rect, true);
      showPanel(this.refs, rect);
    } else {
      placeFixedBox(this.refs.hoverBox, rect, true);
    }
  };

  private async submit(): Promise<void> {
    if (!this.selectedElement || this.state !== "locked") return;

    const comment = this.refs.textarea.value.trim();
    if (!comment) {
      showToast(this.refs, COPY.emptyComment, 1800);
      this.refs.textarea.focus();
      return;
    }

    const requestId = createCaptureRequestId();
    let request: ReturnType<typeof createCaptureRequest> | null = null;
    this.state = "capturing";
    setCapturing(this.refs, true);

    try {
      const preflight = await this.refreshBridgeStatus("capture-preflight", requestId);
      if (preflight && !isBridgeConnected(preflight)) {
        showToast(this.refs, bridgePreflightToast(preflight), 1800);
      }

      this.refs.host.style.visibility = "hidden";
      await nextPaint();

      request = createCaptureRequest(this.selectedElement, comment, {
        debugMode: this.debugMode,
        id: requestId,
      });
      logAnnotationsPageEvent("capture:submit", {
        requestId: request.id,
        selector: request.element.shortSelector,
        url: request.element.url,
      });

      const response = (await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.captureRequest,
        payload: request,
      })) as CaptureResult | undefined;

      this.refs.host.style.visibility = "visible";
      setCapturing(this.refs, false);

      if (!response) throw new Error("capture-failed: empty response");
      logCaptureResultToPageConsole(response);
      await this.handleCaptureResult(response);
    } catch (error) {
      this.refs.host.style.visibility = "visible";
      setCapturing(this.refs, false);
      const diagnostics: DiagnosticLogEntry[] = [
        {
          at: new Date().toISOString(),
          scope: "content",
          level: "error",
          step: "runtime:send-message:error",
          message: errorMessage(error),
          details:
            error instanceof Error ? { name: error.name, stack: error.stack ?? null } : undefined,
        },
      ];
      const fallback: CaptureFallback = {
        markdownPrompt: request ? buildUiNote(request) : buildMinimalUiNote(comment),
        diagnostics,
      };
      console.error("[Annotations] capture failed", error);
      logDiagnosticEntriesToPageConsole(diagnostics);
      await this.handleCaptureResult({ ok: false, reason: "capture-failed", fallback });
    }
  }

  private async refreshBridgeStatus(
    reason: string,
    requestId?: string,
  ): Promise<T3ComposerBridgeStatusResult | null> {
    const refreshSeq = ++this.bridgeStatusRefreshSeq;
    setBridgeStatus(this.refs, {
      state: "checking",
      label: COPY.bridgeChecking,
      title: requestId ? `${COPY.bridgeChecking} (${requestId})` : COPY.bridgeChecking,
    });

    try {
      const response = (await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.t3StatusRequest,
        requestId,
        reason,
      })) as unknown;
      const status = isT3ComposerBridgeStatusResult(response)
        ? response
        : ({
            ok: false,
            reason: "t3-status-malformed",
            message: "Annotations service worker returned a malformed T3 status response.",
          } satisfies T3ComposerBridgeStatusResult);

      if (refreshSeq === this.bridgeStatusRefreshSeq) {
        setBridgeStatus(this.refs, this.presentationForBridgeStatus(status));
      }
      logAnnotationsPageEvent("bridge:status", {
        requestId: requestId ?? null,
        reason,
        ...bridgeStatusLogDetails(status),
      });
      return status;
    } catch (error) {
      const status = {
        ok: false,
        reason: "t3-status-request-failed",
        message: errorMessage(error),
      } satisfies T3ComposerBridgeStatusResult;

      if (refreshSeq === this.bridgeStatusRefreshSeq) {
        setBridgeStatus(this.refs, this.presentationForBridgeStatus(status));
      }
      logAnnotationsPageEvent("bridge:status", {
        requestId: requestId ?? null,
        reason,
        ...bridgeStatusLogDetails(status),
      });
      return status;
    }
  }

  private async handleCaptureResult(result: CaptureResult): Promise<void> {
    if (result.ok) {
      if (result.delivery?.ok) {
        this.markBridgeConnectedFromDelivery(result.delivery);
        showToast(this.refs, COPY.sentToT3, 1800);
        this.cancel();
        return;
      }

      const fallback = await this.tryCopyUiNote(result.markdownPrompt, result.diagnostics);
      if (fallback) {
        logAnnotationsPageEvent("capture:fallback-visible", {
          reason: result.delivery?.ok === false ? result.delivery.reason : "clipboard-blocked",
          message: result.delivery?.ok === false ? (result.delivery.message ?? null) : null,
        });
        logDiagnosticEntriesToPageConsole(fallback.diagnostics);
        this.showCaptureFallback(fallback);
        return;
      }

      if (result.delivery && !result.delivery.ok) {
        logAnnotationsPageEvent("capture:t3-fallback-copied", {
          requestId: result.delivery.requestId ?? null,
          reason: result.delivery.reason,
          message: result.delivery.message ?? null,
        });
      }

      showToast(
        this.refs,
        result.delivery ? deliveryFailureToast(result.delivery) : COPY.copied,
        1800,
      );
      this.cancel();
      return;
    }

    logCaptureResultToPageConsole(result);
    this.showCaptureFallback(result.fallback);
  }

  private markBridgeConnectedFromDelivery(delivery: SuccessfulDelivery): void {
    this.bridgeStatusRefreshSeq += 1;
    this.lastSuccessfulDelivery = { atEpochMs: Date.now(), delivery };
    setBridgeStatus(this.refs, bridgeConnectedFromDeliveryPresentation());
    logAnnotationsPageEvent("bridge:status", {
      requestId: delivery.requestId ?? null,
      reason: "delivery-success",
      ok: true,
      connected: true,
      url: delivery.url,
    });
  }

  private presentationForBridgeStatus(
    status: T3ComposerBridgeStatusResult,
  ): BridgeStatusPresentation {
    if (status.ok || !this.lastSuccessfulDelivery) {
      return bridgeStatusPresentation(status);
    }

    const elapsedMs = Date.now() - this.lastSuccessfulDelivery.atEpochMs;
    if (elapsedMs > RECENT_DELIVERY_STATUS_GRACE_MS) {
      return bridgeStatusPresentation(status);
    }

    return bridgeConnectedFromRecentDeliveryPresentation(status);
  }

  private showCaptureFallback(fallback: CaptureFallback): void {
    this.state = "fallback";
    setPickActive(this.refs, true);
    setPageInteractionBlocked(this.refs, true);
    hidePanel(this.refs);
    showToast(this.refs, COPY.captureFailed, 1800);
    showFallback(this.refs, fallback, {
      onClose: () => this.cancel(),
    });
  }

  private async tryCopyUiNote(
    markdownPrompt: string,
    baseDiagnostics: DiagnosticLogEntry[] = [],
  ): Promise<CaptureFallback | null> {
    let diagnostics = baseDiagnostics;
    this.prepareClipboardFocus();

    diagnostics = appendDiagnostic(
      diagnostics,
      makeDiagnostic(
        "content",
        "info",
        "clipboard:writeText:start",
        "Attempting focused-tab navigator.clipboard.writeText(UI Note).",
        {
          ...clipboardCapabilityDetails(),
        },
      ),
    );

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(
          "clipboard-blocked: navigator.clipboard.writeText unavailable in focused tab",
        );
      }

      await navigator.clipboard.writeText(markdownPrompt);
      diagnostics = appendDiagnostic(
        diagnostics,
        makeDiagnostic(
          "content",
          "info",
          "clipboard:writeText:ok",
          "UI Note copied from focused tab.",
          {
            ...clipboardCapabilityDetails(),
          },
        ),
      );
      return null;
    } catch (error) {
      diagnostics = appendDiagnostic(
        diagnostics,
        errorDiagnostic("content", "clipboard:writeText:error", error, {
          ...clipboardCapabilityDetails(),
        }),
      );
      return {
        markdownPrompt,
        diagnostics,
      };
    }
  }

  private prepareClipboardFocus(): void {
    try {
      window.focus();
    } catch {
      // Best effort only; Chrome may ignore focus() from a content script.
    }

    this.refs.primaryButton.focus({ preventScroll: true });
  }
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function isBridgeConnected(status: T3ComposerBridgeStatusResult): boolean {
  return status.ok && status.connected;
}

function bridgePreflightToast(status: T3ComposerBridgeStatusResult): string {
  if (!status.ok) {
    if (status.reason === "not-paired" || status.reason === "pairing-pending") {
      return COPY.t3NotPairedWillCopy;
    }
    if (status.reason === "bridge-disabled") return COPY.t3BridgeDisabledWillCopy;
    return COPY.t3UnreachableWillCopy;
  }
  if (status.reason === "bridge-disabled") return COPY.t3BridgeDisabledWillCopy;
  if (!status.connected) return COPY.t3NoComposerWillCopy;
  return COPY.t3FallbackWillCopy;
}

function deliveryFailureToast(delivery: T3ComposerDeliveryResult): string {
  if (delivery.ok) return COPY.sentToT3;

  if (delivery.reason === "not-paired" || delivery.reason === "pairing-pending") {
    return COPY.t3NotPairedCopied;
  }
  if (delivery.reason === "bridge-disabled") return COPY.t3BridgeDisabledCopied;
  if (delivery.reason === "composer-not-connected" || delivery.reason === "no-active-composer") {
    return COPY.t3NoComposerCopied;
  }
  if (delivery.reason === "app-unreachable") {
    return COPY.t3UnreachableCopied;
  }
  return `T3 indisponível (${delivery.reason}); nota copiada.`;
}

function bridgeStatusPresentation(status: T3ComposerBridgeStatusResult): BridgeStatusPresentation {
  if (!status.ok) {
    if (status.reason === "not-paired" || status.reason === "pairing-pending") {
      return {
        state: "warning",
        label: COPY.bridgeNotPaired,
        title: status.message ?? status.reason,
      };
    }
    if (status.reason === "bridge-disabled") {
      return {
        state: "warning",
        label: COPY.bridgeDisabled,
        title: status.message ?? status.reason,
      };
    }
    return {
      state: "error",
      label: COPY.bridgeUnavailable,
      title: status.message ? `${status.reason}: ${status.message}` : status.reason,
    };
  }

  if (!status.connected) {
    return {
      state: "warning",
      label: status.reason === "bridge-disabled" ? COPY.bridgeDisabled : COPY.bridgeNoComposer,
      title: status.reason ?? COPY.bridgeNoComposer,
    };
  }

  const targetLabel = status.target?.threadTitle?.trim() || status.target?.threadId || "Composer";
  return {
    state: "connected",
    label: `${COPY.bridgeConnected}: ${targetLabel}`,
    title: `${COPY.bridgeConnected}: ${targetLabel} (${status.target?.clientKind ?? "browser"})`,
  };
}

function bridgeConnectedFromDeliveryPresentation(): BridgeStatusPresentation {
  return {
    state: "connected",
    label: `${COPY.bridgeConnected}: Composer`,
    title: `${COPY.bridgeConnected}: Composer (paired bridge)`,
  };
}

function bridgeConnectedFromRecentDeliveryPresentation(
  failedStatus: Extract<T3ComposerBridgeStatusResult, { ok: false }>,
): BridgeStatusPresentation {
  const presentation = bridgeConnectedFromDeliveryPresentation();
  return {
    ...presentation,
    title: `${presentation.title}; ultimo status falhou: ${failedStatus.reason}`,
  };
}

function bridgeStatusLogDetails(status: T3ComposerBridgeStatusResult): Record<string, unknown> {
  if (!status.ok) {
    return {
      ok: false,
      statusReason: status.reason,
      message: status.message ?? null,
    };
  }

  return {
    ok: true,
    connected: status.connected,
    statusReason: status.reason,
    checkedAtEpochMs: status.checkedAtEpochMs,
    targetThreadId: status.target?.threadId ?? null,
    targetThreadTitle: status.target?.threadTitle ?? null,
    targetClientKind: status.target?.clientKind ?? null,
  };
}

function logAnnotationsPageEvent(step: string, details?: Record<string, unknown>): void {
  console.warn("[Annotations]", step, details ?? {});
}

function logCaptureResultToPageConsole(result: CaptureResult): void {
  const summary = result.ok
    ? {
        ok: true,
        delivery: result.delivery ?? null,
        imagePath: result.savedImage.filename,
        imageBytes: result.savedImage.imageBytes,
      }
    : {
        ok: false,
        reason: result.reason,
      };
  const diagnostics = result.ok
    ? result.diagnostics
    : (result.diagnostics ?? result.fallback.diagnostics);

  console.warn("[Annotations] capture result", summary);
  logDiagnosticEntriesToPageConsole(diagnostics);
}

function logDiagnosticEntriesToPageConsole(entries?: DiagnosticLogEntry[]): void {
  if (!entries || entries.length === 0) return;

  for (const entry of entries) {
    const method = entry.level === "error" ? console.error : console.warn;
    method("[Annotations]", `${entry.scope}/${entry.step}`, entry.message, entry.details ?? {});
  }
}

const reusableController =
  window.__annotationsControllerVersion === CONTROLLER_VERSION
    ? window.__annotationsController
    : undefined;

if (!reusableController) {
  try {
    window.__annotationsController?.destroy();
  } catch {
    document.getElementById(ROOT_ID)?.remove();
  }
}

const controller = reusableController ?? new AnnotationsController();
window.__annotationsController = controller;
window.__annotationsControllerVersion = CONTROLLER_VERSION;
window.__ANNOTATIONS_START__ = () => controller.start();
window.__ANNOTATIONS_TOGGLE_OVERLAY__ = () => controller.toggleOverlay();

if (window.__annotationsRuntimeListener) {
  chrome.runtime.onMessage.removeListener(window.__annotationsRuntimeListener);
}

window.__annotationsRuntimeListener = (message: unknown) => {
  if (message && typeof message === "object" && "type" in message) {
    const type = (message as { type: string }).type;
    if (type === MESSAGE_TYPES.toggleOverlay) controller.toggleOverlay();
    if (type === MESSAGE_TYPES.startPicking) controller.start();
    if (type === MESSAGE_TYPES.cancel) controller.hideOverlay();
  }
};

chrome.runtime.onMessage.addListener(window.__annotationsRuntimeListener);
