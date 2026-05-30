import { redactAndTruncate, redactSensitiveText, sanitizeUrl, truncateText } from "./privacy";
import {
  describeParent,
  getCssPath,
  getElementClasses,
  getFullCssPath,
  getNthOfTypePath,
  getShortSelector,
} from "./selectors";
import type {
  ElementAttributeSnapshot,
  ElementContext,
  ElementDebugContext,
  PrivacyMode,
  Rect,
  SelectorMatchCounts,
  TopElementAtPoint,
  UsefulStyles,
  ViewportInfo,
} from "./types";

export type BuildElementContextOptions = {
  privacyMode?: PrivacyMode;
  debugMode?: boolean;
  url?: string;
  title?: string;
  viewport?: ViewportInfo;
};

const DEBUG_ATTRIBUTE_NAMES = new Set([
  "alt",
  "class",
  "for",
  "href",
  "id",
  "name",
  "placeholder",
  "role",
  "src",
  "title",
  "type",
]);

const STABLE_DEBUG_IDENTIFIER_ATTRIBUTES = new Set([
  "class",
  "data-testid",
  "data-test-id",
  "data-cy",
  "data-qa",
  "data-component",
  "data-slot",
  "id",
]);

const DEBUG_STYLE_PROPERTIES = [
  "display",
  "position",
  "z-index",
  "box-sizing",
  "width",
  "height",
  "margin",
  "padding",
  "border",
  "border-radius",
  "box-shadow",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "white-space",
  "overflow",
  "overflow-x",
  "overflow-y",
  "opacity",
  "visibility",
  "pointer-events",
  "transform",
  "top",
  "right",
  "bottom",
  "left",
  "flex",
  "flex-direction",
  "align-items",
  "justify-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
] as const;

export function buildElementContext(
  element: Element,
  options: BuildElementContextOptions = {},
): ElementContext {
  const privacyMode = options.privacyMode ?? "redact-sensitive";
  const rect = domRectToRect(element.getBoundingClientRect());
  const viewport = options.viewport ?? getViewportInfo();
  const visibleText = getVisibleText(element);
  const processedText =
    privacyMode === "redact-sensitive"
      ? redactAndTruncate(visibleText, 500)
      : truncateText(visibleText, 500);
  const url = options.url ?? globalThis.location?.href ?? "";
  const processedUrl =
    privacyMode === "redact-sensitive" ? redactSensitiveText(sanitizeUrl(url)) : url;
  const siblingStats = getSiblingStats(element);
  const shortSelector = getShortSelector(element);
  const cssPath = getCssPath(element);
  const nthOfTypePath = getNthOfTypePath(element);

  const context: ElementContext = {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: getElementClasses(element, 8),
    shortSelector,
    cssPath,
    nthOfTypePath,
    role: getRole(element),
    accessibleName: getAccessibleName(element),
    visibleText: processedText,
    visibleTextPreview: truncateText(processedText, 140),
    parentSummary: describeParent(element),
    siblingIndex: siblingStats.index,
    similarSiblingCount: siblingStats.count,
    boundingRect: rect,
    viewport,
    url: processedUrl,
    pageTitle:
      privacyMode === "redact-sensitive"
        ? redactAndTruncate(options.title ?? globalThis.document?.title ?? "", 220)
        : truncateText(options.title ?? globalThis.document?.title ?? "", 220),
    usefulStyles: getUsefulStyles(element),
    topElementAtPoint: getTopElementAtPoint(
      rect,
      viewport,
      element.ownerDocument ?? globalThis.document,
    ),
  };

  if (options.debugMode) {
    context.debug = getElementDebugContext(element, {
      cssPath,
      nthOfTypePath,
      privacyMode,
      shortSelector,
    });
  }

  return context;
}

export function getViewportInfo(): ViewportInfo {
  const visualViewport = globalThis.visualViewport;

  return {
    width: globalThis.innerWidth ?? 0,
    height: globalThis.innerHeight ?? 0,
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    scrollX: globalThis.scrollX ?? 0,
    scrollY: globalThis.scrollY ?? 0,
    visualViewportOffsetLeft: visualViewport?.offsetLeft ?? 0,
    visualViewportOffsetTop: visualViewport?.offsetTop ?? 0,
    visualViewportScale: visualViewport?.scale ?? 1,
  };
}

export function domRectToRect(rect: DOMRect | DOMRectReadOnly): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function getVisibleText(element: Element): string {
  const htmlElement = element as HTMLElement;
  return htmlElement.innerText ?? element.textContent ?? "";
}

function getUsefulStyles(element: Element): UsefulStyles {
  const fallback: UsefulStyles = {
    position: "",
    zIndex: "",
    display: "",
    visibility: "",
    opacity: "",
    transform: "",
    pointerEvents: "",
    overflow: "",
    isolation: "",
  };

  try {
    const style = element.ownerDocument?.defaultView?.getComputedStyle(element);
    if (!style) return fallback;

    return {
      position: style.position,
      zIndex: style.zIndex,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      transform: style.transform,
      pointerEvents: style.pointerEvents,
      overflow: style.overflow,
      isolation: style.isolation,
    };
  } catch {
    return fallback;
  }
}

function getElementDebugContext(
  element: Element,
  options: {
    shortSelector: string;
    cssPath: string;
    nthOfTypePath: string;
    privacyMode: PrivacyMode;
  },
): ElementDebugContext {
  const fullCssPath = getFullCssPath(element);

  return {
    fullCssPath,
    selectorMatches: getSelectorMatchCounts(element.ownerDocument ?? globalThis.document, {
      ...options,
      fullCssPath,
    }),
    attributes: getAttributeSnapshot(element, options.privacyMode),
    computedStyles: getDebugComputedStyles(element),
    domPreview: getDomPreview(element, options.privacyMode),
  };
}

function getSelectorMatchCounts(
  ownerDocument: Document | undefined,
  selectors: { shortSelector: string; cssPath: string; fullCssPath: string; nthOfTypePath: string },
): SelectorMatchCounts {
  return {
    shortSelector: countSelectorMatches(ownerDocument, selectors.shortSelector),
    cssPath: countSelectorMatches(ownerDocument, selectors.cssPath),
    fullCssPath: countSelectorMatches(ownerDocument, selectors.fullCssPath),
    nthOfTypePath: countSelectorMatches(ownerDocument, selectors.nthOfTypePath),
  };
}

function countSelectorMatches(
  ownerDocument: Document | undefined,
  selector: string,
): number | null {
  if (!ownerDocument || !selector) return null;

  try {
    return ownerDocument.querySelectorAll(selector).length;
  } catch {
    return null;
  }
}

function getAttributeSnapshot(
  element: Element,
  privacyMode: PrivacyMode,
): ElementAttributeSnapshot[] {
  return Array.from(element.attributes)
    .filter((attribute) => shouldCaptureDebugAttribute(attribute.name))
    .map((attribute) => ({
      name: attribute.name,
      value: sanitizeDebugValue(attribute.value, privacyMode, attribute.name),
    }))
    .slice(0, 20);
}

function shouldCaptureDebugAttribute(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    DEBUG_ATTRIBUTE_NAMES.has(normalized) ||
    normalized.startsWith("aria-") ||
    normalized.startsWith("data-")
  );
}

function getDebugComputedStyles(element: Element): Record<string, string> {
  try {
    const style = element.ownerDocument?.defaultView?.getComputedStyle(element);
    if (!style) return {};

    return Object.fromEntries(
      DEBUG_STYLE_PROPERTIES.map((property) => [
        property,
        truncateText(style.getPropertyValue(property), 160),
      ]).filter(([, value]) => value),
    );
  } catch {
    return {};
  }
}

function getDomPreview(element: Element, privacyMode: PrivacyMode): string | null {
  try {
    const tag = element.tagName.toLowerCase();
    const attributes = getAttributeSnapshot(element, privacyMode)
      .map((attribute) => `${attribute.name}="${attribute.value.replaceAll('"', "'")}"`)
      .join(" ");
    const text = sanitizeDebugValue(getVisibleText(element), privacyMode, "text");
    const openTag = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
    const closeTag = `</${tag}>`;

    if (!text) return truncateText(`${openTag}${closeTag}`, 320);
    return truncateText(`${openTag}${text}${closeTag}`, 320);
  } catch {
    return null;
  }
}

function sanitizeDebugValue(
  value: string,
  privacyMode: PrivacyMode,
  attributeName: string,
): string {
  const maybeUrl = attributeName === "href" || attributeName === "src" ? sanitizeUrl(value) : value;
  if (
    privacyMode === "redact-sensitive" &&
    STABLE_DEBUG_IDENTIFIER_ATTRIBUTES.has(attributeName.toLowerCase())
  ) {
    return truncateText(maybeUrl, 220);
  }
  return privacyMode === "redact-sensitive"
    ? redactAndTruncate(maybeUrl, 220)
    : truncateText(maybeUrl, 220);
}

function getTopElementAtPoint(
  rect: Rect,
  viewport: ViewportInfo,
  ownerDocument: Document | undefined,
): TopElementAtPoint | null {
  const visibleRect = intersectRects(rect, {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });

  if (visibleRect.width <= 0 || visibleRect.height <= 0) return null;

  const x = clamp(visibleRect.x + visibleRect.width / 2, 0, Math.max(0, viewport.width - 1));
  const y = clamp(visibleRect.y + visibleRect.height / 2, 0, Math.max(0, viewport.height - 1));

  try {
    const topElement = ownerDocument?.elementFromPoint?.(x, y);
    if (!topElement) return null;

    return {
      x,
      y,
      label: getElementLabel(topElement),
      shortSelector: getShortSelector(topElement),
    };
  } catch {
    return null;
  }
}

function getRole(element: Element): string | null {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit;

  const tag = element.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && element.hasAttribute("href")) return "link";
  if (tag === "input") {
    const type = element.getAttribute("type") ?? "text";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    return "textbox";
  }
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";

  return null;
}

function getAccessibleName(element: Element): string | null {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return truncateText(ariaLabel, 140);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy && element.ownerDocument) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (text.trim()) return truncateText(text, 140);
  }

  const alt = element.getAttribute("alt");
  if (alt) return truncateText(alt, 140);

  const title = element.getAttribute("title");
  if (title) return truncateText(title, 140);

  const role = getRole(element);
  if (role === "button" || role === "link") {
    const text = getVisibleText(element);
    if (text.trim()) return truncateText(text, 140);
  }

  return null;
}

function getSiblingStats(element: Element): { index: number; count: number } {
  const parent = element.parentElement;
  if (!parent) return { index: 0, count: 1 };

  const key = getSimilarityKey(element);
  const siblings = Array.from(parent.children).filter((child) => getSimilarityKey(child) === key);
  return {
    index: Math.max(0, siblings.indexOf(element)),
    count: Math.max(1, siblings.length),
  };
}

function getSimilarityKey(element: Element): string {
  return `${element.tagName.toLowerCase()}|${getElementClasses(element, 3).toSorted().join(".")}`;
}

function getElementLabel(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = getElementClasses(element, 2)
    .map((item) => `.${item}`)
    .join("");
  return `${tag}${id}${classes}`;
}

function intersectRects(a: Rect, b: Rect): Rect {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
