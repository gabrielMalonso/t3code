export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewportInfo = {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  visualViewportOffsetLeft: number;
  visualViewportOffsetTop: number;
  visualViewportScale: number;
};

export type PrivacyMode = "normal" | "redact-sensitive";

export type UsefulStyles = {
  position: string;
  zIndex: string;
  display: string;
  visibility: string;
  opacity: string;
  transform: string;
  pointerEvents: string;
  overflow: string;
  isolation: string;
};

export type TopElementAtPoint = {
  x: number;
  y: number;
  label: string;
  shortSelector: string;
};

export type ElementAttributeSnapshot = {
  name: string;
  value: string;
};

export type SelectorMatchCounts = {
  shortSelector: number | null;
  cssPath: number | null;
  fullCssPath: number | null;
  nthOfTypePath: number | null;
};

export type ElementDebugContext = {
  fullCssPath: string;
  selectorMatches: SelectorMatchCounts;
  attributes: ElementAttributeSnapshot[];
  computedStyles: Record<string, string>;
  domPreview: string | null;
};

export type ElementContext = {
  tagName: string;
  id: string | null;
  classes: string[];
  shortSelector: string;
  cssPath: string;
  nthOfTypePath: string;
  role: string | null;
  accessibleName: string | null;
  visibleText: string;
  visibleTextPreview: string;
  parentSummary: string | null;
  siblingIndex: number;
  similarSiblingCount: number;
  boundingRect: Rect;
  viewport: ViewportInfo;
  url: string;
  pageTitle: string;
  usefulStyles: UsefulStyles;
  topElementAtPoint: TopElementAtPoint | null;
  debug?: ElementDebugContext;
};

export type CaptureRequest = {
  id: string;
  comment: string;
  element: ElementContext;
  privacyMode: PrivacyMode;
  debugMode: boolean;
  createdAt: string;
};

export type CaptureFailureReason =
  | "capture-failed"
  | "render-failed"
  | "download-failed"
  | "clipboard-blocked"
  | "restricted-page"
  | "offscreen-unavailable"
  | "unknown";

export type CaptureFallback = {
  markdownPrompt: string;
  diagnostics?: DiagnosticLogEntry[];
};

export type SavedImage = {
  downloadId: number;
  filename: string;
  requestedFilename: string;
  imageBytes: number;
  width: number;
  height: number;
};

export type T3ComposerDeliveryResult =
  | {
      ok: true;
      requestId?: string;
      tabId: number | null;
      url: string | null;
      mode?: "http" | "tab";
    }
  | {
      ok: false;
      requestId?: string;
      reason: string;
      message?: string;
    };

export type T3ComposerBridgeStatusTarget = {
  subscriberId: string;
  threadId: string;
  threadTitle: string | null;
  clientKind: "browser" | "desktop";
  activatedAtEpochMs: number;
  lastSeenAtEpochMs: number;
};

export type T3ComposerBridgeStatusResult =
  | {
      ok: true;
      connected: boolean;
      reason: "composer-not-connected" | null;
      checkedAtEpochMs: number;
      target: T3ComposerBridgeStatusTarget | null;
    }
  | {
      ok: false;
      reason: string;
      message?: string;
    };

export type CaptureSuccess = {
  ok: true;
  markdownPrompt: string;
  savedImage: SavedImage;
  delivery?: T3ComposerDeliveryResult;
  diagnostics?: DiagnosticLogEntry[];
};

export type CaptureFailure = {
  ok: false;
  reason: CaptureFailureReason;
  fallback: CaptureFallback;
  diagnostics?: DiagnosticLogEntry[];
};

export type CaptureResult = CaptureSuccess | CaptureFailure;

export type RenderImageResult =
  | {
      ok: true;
      imageDataUrl: string;
      imageBytes: number;
      width: number;
      height: number;
      diagnostics?: DiagnosticLogEntry[];
    }
  | { ok: false; reason: CaptureFailureReason; fallback: CaptureFallback };

export type DiagnosticLogEntry = {
  at: string;
  scope: "content" | "background" | "offscreen";
  level: "info" | "warn" | "error";
  step: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type AnnotationsMessage =
  | { type: "ANNOTATIONS_TOGGLE_OVERLAY" }
  | { type: "ANNOTATIONS_START_PICKING" }
  | { type: "ANNOTATIONS_CANCEL" }
  | { type: "ANNOTATIONS_T3_STATUS_REQUEST"; requestId?: string; reason?: string }
  | { type: "ANNOTATIONS_CAPTURE_REQUEST"; payload: CaptureRequest }
  | { type: "ANNOTATIONS_CAPTURE_DONE"; payload: CaptureResult }
  | { type: "ANNOTATIONS_CAPTURE_FAILED"; payload: CaptureResult };

export type RenderRequestMessage = {
  type: "ANNOTATIONS_RENDER_REQUEST";
  payload: {
    request: CaptureRequest;
    screenshotDataUrl: string;
    diagnostics?: DiagnosticLogEntry[];
  };
};

export type RuntimeMessage = AnnotationsMessage | RenderRequestMessage;
