import { describe, expect, it } from "vitest";
import { buildMinimalUiNote, buildUiNote } from "../../src/shared/ui-note";
import type { CaptureRequest } from "../../src/shared/types";

const request: CaptureRequest = {
  id: "capture-1",
  comment: "mover CTA para cima",
  privacyMode: "redact-sensitive",
  debugMode: false,
  createdAt: "2026-05-25T19:00:00.000Z",
  element: {
    tagName: "button",
    id: "buy",
    classes: ["primary"],
    shortSelector: "button#buy.primary",
    cssPath: "main.checkout > button#buy",
    nthOfTypePath: "html:nth-of-type(1) > body:nth-of-type(1) > button:nth-of-type(1)",
    role: "button",
    accessibleName: "Comprar",
    visibleText: "Comprar agora",
    visibleTextPreview: "Comprar agora",
    parentSummary: "main.checkout",
    siblingIndex: 0,
    similarSiblingCount: 1,
    boundingRect: { x: 100, y: 120, width: 160, height: 44 },
    viewport: {
      width: 1280,
      height: 720,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0,
      visualViewportOffsetLeft: 0,
      visualViewportOffsetTop: 0,
      visualViewportScale: 1,
    },
    url: "https://example.com/checkout?token=secret&tab=plan&membershipId=kh7827jayjbfe3nhm8zc97yctd84n3yt",
    pageTitle: "Checkout",
    usefulStyles: {
      position: "relative",
      zIndex: "10",
      display: "inline-flex",
      visibility: "visible",
      opacity: "0.8",
      transform: "translateY(4px)",
      pointerEvents: "auto",
      overflow: "hidden",
      isolation: "isolate",
    },
    topElementAtPoint: {
      x: 180,
      y: 142,
      label: "button#buy.primary",
      shortSelector: "button#buy.primary",
    },
  },
};

describe("buildUiNote", () => {
  it("includes the saved image path and technical metadata", () => {
    const note = buildUiNote(request, {
      imagePath: "/Users/test/Downloads/Annotations-PNG/2026-05-25-1900-button-buy-capture1.png",
    });

    expect(note).toContain("# UI Note");
    expect(note).toContain("## Prompt\n\nmover CTA para cima");
    expect(note).toContain("## Informações\n\nImagem:");
    expect(note).not.toContain("Comentário:");
    expect(note).toContain(
      "`/Users/test/Downloads/Annotations-PNG/2026-05-25-1900-button-buy-capture1.png`",
    );
    expect(note).toContain("token=<redacted>");
    expect(note).toContain("membershipId=<redacted>");
    expect(note).toContain("`button#buy.primary`");
    expect(note).not.toContain("CSS path:");
    expect(note).not.toContain("main.checkout > button#buy");
    expect(note).toContain("Elemento no ponto:\n`button#buy.primary [button#buy.primary]`");
    expect(note).toContain("`Comprar agora`");
    expect(note).toContain("Ponto:\n`x=180 y=142`");
    expect(note).toContain("`x=100 y=120 w=160 h=44 dpr=2`");
    expect(note).toContain("Pistas:\n`position=relative; z-index=10; transform=translateY(4px)`");
    expect(note).not.toContain("opacity=0.8");
    expect(note).not.toContain("## Debug");
  });

  it("does not invent an image path when none was confirmed", () => {
    const note = buildUiNote(request);

    expect(note).toContain("## Informações\n\nImagem:\n`(imagem não salva)`");
    expect(note).not.toContain("Annotations-PNG/");
  });

  it("redacts sensitive selector and top-element metadata in the copied note", () => {
    const note = buildUiNote({
      ...request,
      comment: "ajustar CTA de ana@example.com",
      element: {
        ...request.element,
        shortSelector: 'button[aria-label="Comprar para ana@example.com"]',
        visibleText: "Comprar para CPF 123.456.789-10",
        visibleTextPreview: "Comprar para CPF 123.456.789-10",
        url: "https://example.com/patients/ana@example.com?token=secret&tab=profile",
        topElementAtPoint: {
          x: 180,
          y: 142,
          label: "button#patient-12345678910.primary",
          shortSelector: 'button[data-testid="patient-12345678910"]',
        },
      },
    });

    expect(note).toContain("[email]");
    expect(note).toContain("[cpf]");
    expect(note).not.toContain("ana@example.com");
    expect(note).not.toContain("123.456.789-10");
    expect(note).not.toContain("12345678910");
  });

  it("redacts sensitive text in the minimal fallback note", () => {
    const note = buildMinimalUiNote(
      "Revisar conta ana@example.com com token abcdefghijklmnopqrstuvwxyz123456",
    );

    expect(note).toContain("[email]");
    expect(note).toContain("[token]");
    expect(note).not.toContain("ana@example.com");
    expect(note).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("adds expanded debug metadata only when debug mode is enabled", () => {
    const note = buildUiNote({
      ...request,
      debugMode: true,
      element: {
        ...request.element,
        debug: {
          fullCssPath:
            "html:nth-of-type(1) > body:nth-of-type(1) > main.checkout:nth-of-type(1) > button#buy.primary:nth-of-type(1)",
          selectorMatches: {
            shortSelector: 1,
            cssPath: 1,
            fullCssPath: 1,
            nthOfTypePath: 1,
          },
          attributes: [
            { name: "id", value: "buy" },
            { name: "data-testid", value: "checkout-buy" },
          ],
          computedStyles: {
            display: "inline-flex",
            padding: "8px 12px",
            "font-size": "14px",
            opacity: "0.8",
          },
          domPreview: '<button id="buy" data-testid="checkout-buy">Comprar agora</button>',
        },
      },
    });

    expect(note).toContain("## Debug");
    expect(note).toContain("cssPath: main.checkout > button#buy");
    expect(note).toContain(
      "fullCssPath: html:nth-of-type(1) > body:nth-of-type(1) > main.checkout:nth-of-type(1) > button#buy.primary:nth-of-type(1)",
    );
    expect(note).toContain(
      "nthOfTypePath: html:nth-of-type(1) > body:nth-of-type(1) > button:nth-of-type(1)",
    );
    expect(note).toContain("matches.cssPath: 1");
    expect(note).toContain("matches.fullCssPath: 1");
    expect(note).toContain('data-testid="checkout-buy"');
    expect(note).toContain("padding: 8px 12px;");
    expect(note).toContain("opacity: 0.8;");
    expect(note).toContain('<button id="buy" data-testid="checkout-buy">Comprar agora</button>');
  });

  it("redacts sensitive text in debug-only fields", () => {
    const note = buildUiNote({
      ...request,
      debugMode: true,
      element: {
        ...request.element,
        accessibleName: "Comprar para ana@example.com",
        parentSummary: 'section[aria-label="Paciente ana@example.com"]',
        debug: {
          fullCssPath:
            "html:nth-of-type(1) > body:nth-of-type(1) > main.checkout:nth-of-type(1) > button#buy.primary:nth-of-type(1)",
          selectorMatches: {
            shortSelector: 1,
            cssPath: 1,
            fullCssPath: 1,
            nthOfTypePath: 1,
          },
          attributes: [{ name: "aria-label", value: "Comprar para ana@example.com" }],
          computedStyles: {},
          domPreview: '<button aria-label="Comprar para ana@example.com">Comprar</button>',
        },
      },
    });

    expect(note).toContain("accessibleName=Comprar para [email]");
    expect(note).toContain('parent=section[aria-label="Paciente [email]"]');
    expect(note).toContain('aria-label="Comprar para [email]"');
    expect(note).toContain('<button aria-label="Comprar para [email]">Comprar</button>');
    expect(note).not.toContain("ana@example.com");
  });
});
