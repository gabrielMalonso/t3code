import { redactAndTruncate, redactSensitiveText, sanitizeUrl, truncateText } from "./privacy";
import type { CaptureRequest, ElementContext, PrivacyMode } from "./types";

export type BuildUiNoteOptions = {
  imagePath?: string;
};

export function buildUiNote(request: CaptureRequest, options: BuildUiNoteOptions = {}): string {
  const element = request.element;
  const url =
    request.privacyMode === "redact-sensitive"
      ? redactSensitiveText(sanitizeUrl(element.url))
      : element.url;

  const lines = [
    "# UI Note",
    "",
    "## Prompt",
    "",
    promptBlock(request.comment, request.privacyMode),
    "",
    "## Informações",
    "",
    "Imagem:",
    code(options.imagePath ?? "(imagem não salva)"),
    "",
    "URL:",
    code(url),
    "",
    "Elemento selecionado:",
    code(formatPrivacyText(element.shortSelector, request.privacyMode, "(indisponivel)")),
    "",
    "Elemento no ponto:",
    code(formatTopElementAtPoint(element, request.privacyMode)),
    "",
    "Texto:",
    code(
      formatPrivacyText(
        element.visibleTextPreview || element.visibleText,
        request.privacyMode,
        "(sem texto visível)",
      ),
    ),
    "",
    "Ponto:",
    code(formatPoint(element)),
    "",
    "Rect:",
    code(formatRect(element)),
    "",
    "Pistas:",
    code(formatHints(element)),
  ];

  if (request.debugMode) {
    lines.push(...formatDebugSection(element, request.privacyMode));
  }

  return lines.join("\n");
}

export function buildMinimalUiNote(comment: string): string {
  return [
    "# UI Note",
    "",
    "## Prompt",
    "",
    promptBlock(comment, "redact-sensitive"),
    "",
    "## Informações",
    "",
    "Imagem:",
    code("(imagem não salva)"),
  ].join("\n");
}

function formatRect(element: ElementContext): string {
  const rect = element.boundingRect;
  return [
    `x=${round(rect.x)}`,
    `y=${round(rect.y)}`,
    `w=${round(rect.width)}`,
    `h=${round(rect.height)}`,
    `dpr=${element.viewport.devicePixelRatio}`,
  ].join(" ");
}

function formatHints(element: ElementContext): string {
  const styles = element.usefulStyles;
  return `position=${styles.position || "(vazio)"}; z-index=${styles.zIndex || "(vazio)"}; transform=${styles.transform || "(vazio)"}`;
}

function formatDebugSection(element: ElementContext, privacyMode: PrivacyMode): string[] {
  const debug = element.debug;

  return [
    "",
    "## Debug",
    "",
    "Seletores:",
    fencedCode(
      [
        `shortSelector: ${formatPrivacyText(element.shortSelector, privacyMode, "(indisponivel)")}`,
        `cssPath: ${formatPrivacyText(element.cssPath, privacyMode, "(indisponivel)")}`,
        `fullCssPath: ${formatPrivacyText(debug?.fullCssPath, privacyMode, "(indisponivel)")}`,
        `nthOfTypePath: ${formatPrivacyText(element.nthOfTypePath, privacyMode, "(indisponivel)")}`,
        `matches.shortSelector: ${formatCount(debug?.selectorMatches.shortSelector)}`,
        `matches.cssPath: ${formatCount(debug?.selectorMatches.cssPath)}`,
        `matches.fullCssPath: ${formatCount(debug?.selectorMatches.fullCssPath)}`,
        `matches.nthOfTypePath: ${formatCount(debug?.selectorMatches.nthOfTypePath)}`,
      ].join("\n"),
    ),
    "",
    "Elemento:",
    fencedCode(
      [
        `tag=${element.tagName}`,
        `id=${formatPrivacyText(element.id, privacyMode, "(sem id)")}`,
        `classes=${formatPrivacyText(element.classes.join(" "), privacyMode, "(sem classes)")}`,
        `role=${element.role ?? "(sem role)"}`,
        `accessibleName=${formatPrivacyText(element.accessibleName, privacyMode, "(sem nome acessivel)")}`,
        `parent=${formatPrivacyText(element.parentSummary, privacyMode, "(sem parent)")}`,
        `siblings=${element.siblingIndex + 1}/${element.similarSiblingCount}`,
      ].join("\n"),
    ),
    "",
    "Atributos:",
    fencedCode(formatAttributes(debug?.attributes ?? [], privacyMode)),
    "",
    "Layout:",
    fencedCode(
      [
        `rect=${formatRect(element)}`,
        `viewport=w=${round(element.viewport.width)} h=${round(element.viewport.height)} scrollX=${round(element.viewport.scrollX)} scrollY=${round(element.viewport.scrollY)}`,
        `visualViewport=offsetX=${round(element.viewport.visualViewportOffsetLeft)} offsetY=${round(element.viewport.visualViewportOffsetTop)} scale=${element.viewport.visualViewportScale}`,
        `topElementAtPoint=${formatPrivacyText(formatTopElementAtPoint(element, privacyMode), privacyMode, "(sem área visível)")}`,
      ].join("\n"),
    ),
    "",
    "CSS computado:",
    fencedCode(formatComputedStyles(debug?.computedStyles ?? {})),
    "",
    "DOM:",
    fencedCode(formatPrivacyText(debug?.domPreview, privacyMode, "(preview indisponivel)")),
  ];
}

function formatAttributes(
  attributes: NonNullable<ElementContext["debug"]>["attributes"],
  privacyMode: PrivacyMode,
): string {
  if (attributes.length === 0) return "(nenhum atributo capturado)";
  return attributes
    .map(
      (attribute) => `${attribute.name}="${formatPrivacyText(attribute.value, privacyMode, "")}"`,
    )
    .join("\n");
}

function formatComputedStyles(styles: Record<string, string>): string {
  const entries = Object.entries(styles).filter(([, value]) => value);
  if (entries.length === 0) return "(CSS computado indisponivel)";
  return entries.map(([property, value]) => `${property}: ${value};`).join("\n");
}

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "(indisponivel)";
}

function formatPrivacyText(
  value: string | null | undefined,
  privacyMode: PrivacyMode,
  fallback: string,
  maxLength = 500,
): string {
  if (!value) return fallback;
  return privacyMode === "redact-sensitive"
    ? redactAndTruncate(value, maxLength)
    : truncateText(value, maxLength);
}

function formatTopElementAtPoint(element: ElementContext, privacyMode: PrivacyMode): string {
  const top = element.topElementAtPoint;
  if (!top) return "(sem área visível)";
  const label = formatPrivacyText(top.label, privacyMode, "(sem label)");
  const selector = formatPrivacyText(top.shortSelector, privacyMode, "(sem seletor)");
  return `${label} [${selector}]`;
}

function formatPoint(element: ElementContext): string {
  const top = element.topElementAtPoint;
  if (!top) return "x=(sem área visível) y=(sem área visível)";
  return `x=${round(top.x)} y=${round(top.y)}`;
}

function promptBlock(value: string, privacyMode: PrivacyMode): string {
  const trimmed = value.trim();
  if (!trimmed) return "(vazio)";
  return privacyMode === "redact-sensitive" ? redactSensitiveText(trimmed) : trimmed;
}

function code(value: string): string {
  return `\`${sanitizeInlineCode(value)}\``;
}

function fencedCode(value: string): string {
  return `\`\`\`\n${sanitizeBlockCode(value)}\n\`\`\``;
}

function sanitizeInlineCode(value: string): string {
  return value.replaceAll("`", "'").replace(/\s+/g, " ").trim();
}

function sanitizeBlockCode(value: string): string {
  return value.replaceAll("```", "'''").trim();
}

function round(value: number): number {
  return Math.round(value);
}
