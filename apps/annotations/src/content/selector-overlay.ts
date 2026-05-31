import { getShortSelector } from "../shared/selectors";
import type { Rect } from "../shared/types";

const NON_SELECTABLE_TAGS = new Set([
  "html",
  "head",
  "meta",
  "link",
  "style",
  "script",
  "noscript",
  "template",
]);

export function findPickTarget(
  clientX: number,
  clientY: number,
  host: HTMLElement,
  doc: Document = document,
): Element | null {
  const stack = doc.elementsFromPoint(clientX, clientY);
  return stack.find((element) => isSelectableElement(element, host)) ?? null;
}

export function isSelectableElement(element: Element, host: HTMLElement): boolean {
  if (element === host || host.contains(element)) return false;
  if (NON_SELECTABLE_TAGS.has(element.tagName.toLowerCase())) return false;
  if (element.closest?.("[data-annotations-root='true']")) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;

  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0)
    return false;

  return true;
}

export function elementRect(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function elementLabel(element: Element): string {
  return getShortSelector(element);
}

export function placeFixedBox(box: HTMLElement, rect: Rect, visible: boolean): void {
  if (!visible) {
    box.style.opacity = "0";
    box.style.display = "none";
    return;
  }

  Object.assign(box.style, {
    display: "block",
    opacity: "1",
    transform: `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`,
    width: `${Math.round(rect.width)}px`,
    height: `${Math.round(rect.height)}px`,
  });
}
