export function escapeCssIdentifier(value: string): string {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);

  return value.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, (match, leadingDigit: string | undefined) => {
    if (leadingDigit) return `\\3${leadingDigit} `;
    const code = match.codePointAt(0)?.toString(16) ?? "0";
    return `\\${code} `;
  });
}

export function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
}

const STABLE_SELECTOR_ATTRIBUTES = [
  "data-testid",
  "data-slot",
  "data-test-id",
  "data-cy",
  "data-qa",
  "data-component",
] as const;
const SEMANTIC_TAGS = new Set([
  "article",
  "aside",
  "button",
  "footer",
  "form",
  "header",
  "main",
  "nav",
  "section",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
]);

export function getElementClasses(element: Element, limit = 4): string[] {
  return Array.from(element.classList)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith("annotations-"))
    .slice(0, limit);
}

export function getStableSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  for (const attribute of STABLE_SELECTOR_ATTRIBUTES) {
    const value = element.getAttribute(attribute)?.trim();
    if (value) return `${tag}[${attribute}="${escapeCssString(value)}"]`;
  }

  return null;
}

export function getNearestStableAncestorSelector(element: Element): string | null {
  let current = element.parentElement;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const stableSelector = getStableSelector(current);
    if (stableSelector) return stableSelector;
    current = current.parentElement;
  }

  return null;
}

export function getShortSelector(element: Element): string {
  const stableSelector = getStableSelector(element);
  if (stableSelector) return stableSelector;

  const tag = element.tagName.toLowerCase();
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return `${tag}[aria-label="${escapeCssString(ariaLabel)}"]`;

  const role = getRole(element);
  const accessibleName = getAccessibleName(element);
  if (role && accessibleName)
    return `${tag}[role="${escapeCssString(role)}"][name="${escapeCssString(accessibleName)}"]`;

  if (element.id) return `${tag}#${escapeCssIdentifier(element.id)}`;
  if (SEMANTIC_TAGS.has(tag)) return tag;

  const classes = getShortClasses(element, 2)
    .map((item) => `.${escapeCssIdentifier(item)}`)
    .join("");

  return `${tag}${classes}`;
}

export function getNthOfType(element: Element): number {
  let index = 1;
  let sibling = element.previousElementSibling;

  while (sibling) {
    if (sibling.tagName === element.tagName) index += 1;
    sibling = sibling.previousElementSibling;
  }

  return index;
}

export function getCssPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const stableSelector = getStableSelector(current);
    if (stableSelector) {
      segments.unshift(stableSelector);
      break;
    }

    if (current.id) {
      segments.unshift(`${tag}#${escapeCssIdentifier(current.id)}`);
      break;
    }

    const classes = getElementClasses(current, 2)
      .map((item) => `.${escapeCssIdentifier(item)}`)
      .join("");
    const nth = getNthOfType(current);
    segments.unshift(`${tag}${classes}:nth-of-type(${nth})`);
    current = current.parentElement;
  }

  return segments.join(" > ");
}

export function getFullCssPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    segments.unshift(getFullCssPathSegment(current));
    current = current.parentElement;
  }

  return segments.join(" > ");
}

export function getNthOfTypePath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${getNthOfType(current)})`);
    current = current.parentElement;
  }

  return segments.join(" > ");
}

export function describeParent(element: Element): string | null {
  const parent = element.parentElement;
  if (!parent) return null;
  return getShortSelector(parent);
}

function getShortClasses(element: Element, limit: number): string[] {
  return getElementClasses(element, 8)
    .filter((item) => item.length <= 32)
    .filter((item) => !hasSelectorNoisyCharacters(item))
    .slice(0, limit);
}

function getFullCssPathSegment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${escapeCssIdentifier(element.id)}` : "";
  const classes = getElementClasses(element, 3)
    .map((item) => `.${escapeCssIdentifier(item)}`)
    .join("");

  return `${tag}${id}${classes}:nth-of-type(${getNthOfType(element)})`;
}

function hasSelectorNoisyCharacters(value: string): boolean {
  return (
    value.includes("[") ||
    value.includes("]") ||
    value.includes("(") ||
    value.includes(")") ||
    value.includes(":")
  );
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
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy && element.ownerDocument) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text.slice(0, 120);
  }

  const alt = element.getAttribute("alt")?.trim();
  if (alt) return alt.slice(0, 120);

  const title = element.getAttribute("title")?.trim();
  if (title) return title.slice(0, 120);

  const role = getRole(element);
  if (role === "button" || role === "link") {
    const text = ((element as HTMLElement).innerText ?? element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.slice(0, 120);
  }

  return null;
}
