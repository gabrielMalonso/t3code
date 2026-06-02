export const ROOT_ID = "annotations-root";
const TOP_LAYER_ID = "annotations-top-layer";
const TOP_LAYER_STYLE_ID = "annotations-top-layer-style";
const HOSTILE_PAGE_EVENTS = [
  "pointerdown",
  "mousedown",
  "mouseup",
  "pointerup",
  "click",
  "focusin",
] as const;

const TOP_LAYER_STYLE = `
  #${TOP_LAYER_ID} {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
    pointer-events: none;
  }

  #${TOP_LAYER_ID}::backdrop {
    background: transparent;
  }
`;

export type AnnotationsShadow = {
  host: HTMLDivElement;
  shadow: ShadowRoot;
};

export function createAnnotationsShadowRoot(doc: Document = document): AnnotationsShadow {
  const existing = doc.getElementById(ROOT_ID) as HTMLDivElement | null;
  const host = existing ?? doc.createElement("div");

  if (!existing) {
    host.id = ROOT_ID;
    host.dataset.annotationsRoot = "true";
    doc.documentElement.appendChild(host);
  }

  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    width: "0",
    height: "0",
    pointerEvents: "none",
    zIndex: "2147483646",
  });

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  return { host, shadow };
}

export function enterAnnotationsTopLayer(host: HTMLElement): void {
  const doc = host.ownerDocument;
  const topLayer = ensureTopLayer(doc);
  if (topLayer.contains(host) && topLayer.open) return;

  const previousParent = host.parentNode;
  const previousNextSibling = host.nextSibling;
  topLayer.appendChild(host);

  if (topLayer.open) return;

  try {
    topLayer.showModal();
  } catch {
    if (previousParent) {
      previousParent.insertBefore(host, previousNextSibling);
    } else {
      doc.documentElement.appendChild(host);
    }
  }
}

export function exitAnnotationsTopLayer(host: HTMLElement): void {
  const doc = host.ownerDocument;
  const topLayer = doc.getElementById(TOP_LAYER_ID);
  if (!(topLayer instanceof HTMLDialogElement) || !topLayer.contains(host)) return;

  if (topLayer.open) {
    topLayer.close();
  }
  doc.documentElement.appendChild(host);
}

export function isAnnotationsEvent(event: Event, host: HTMLElement): boolean {
  return event.composedPath().includes(host);
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

export function stopHostilePageHandlers(element: HTMLElement): void {
  for (const eventName of HOSTILE_PAGE_EVENTS) {
    element.addEventListener(eventName, stopPropagation);
  }
}

function ensureTopLayer(doc: Document): HTMLDialogElement {
  ensureTopLayerStyle(doc);

  const existing = doc.getElementById(TOP_LAYER_ID);
  if (existing instanceof HTMLDialogElement) return existing;
  existing?.remove();

  const topLayer = doc.createElement("dialog");
  topLayer.id = TOP_LAYER_ID;
  topLayer.dataset.annotationsRoot = "true";
  topLayer.setAttribute("aria-label", "Annotations overlay");
  Object.assign(topLayer.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    overflow: "visible",
    pointerEvents: "none",
  });
  topLayer.addEventListener("cancel", (event) => event.preventDefault());
  stopHostilePageHandlers(topLayer);
  doc.documentElement.appendChild(topLayer);
  return topLayer;
}

function ensureTopLayerStyle(doc: Document): void {
  if (doc.getElementById(TOP_LAYER_STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = TOP_LAYER_STYLE_ID;
  style.textContent = TOP_LAYER_STYLE;
  (doc.head ?? doc.documentElement).appendChild(style);
}
