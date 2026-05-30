export const ROOT_ID = "annotations-root";

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

export function isAnnotationsEvent(event: Event, host: HTMLElement): boolean {
  return event.composedPath().includes(host);
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

export function stopHostilePageHandlers(element: HTMLElement): void {
  element.addEventListener("pointerdown", stopPropagation);
  element.addEventListener("mousedown", stopPropagation);
  element.addEventListener("mouseup", stopPropagation);
  element.addEventListener("pointerup", stopPropagation);
  element.addEventListener("click", stopPropagation);
  element.addEventListener("focusin", stopPropagation);
}
