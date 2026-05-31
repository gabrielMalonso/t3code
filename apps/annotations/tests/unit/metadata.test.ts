import { afterEach, describe, expect, it, vi } from "vitest";
import { buildElementContext } from "../../src/shared/metadata";

describe("buildElementContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("extracts selectors, accessible name, sibling stats and redacted text", () => {
    document.body.innerHTML = `
      <main>
        <button class="chip">Cancelar</button>
        <button
          class="chip primary"
          data-testid="profile-save"
          aria-label="Salvar alteracoes"
          style="position: relative; z-index: 3; display: inline-flex; visibility: visible; opacity: 0.72; transform: translateX(2px); pointer-events: auto; overflow: hidden; isolation: isolate;"
        >Salvar ana@example.com</button>
        <button class="chip">Excluir</button>
      </main>
    `;
    const button = document.querySelector(".primary") as HTMLElement;
    button.getBoundingClientRect = () =>
      ({
        x: 20,
        y: 30,
        width: 120,
        height: 40,
        top: 30,
        left: 20,
        right: 140,
        bottom: 70,
        toJSON: () => ({}),
      }) as DOMRect;
    const elementFromPoint = mockElementFromPoint(button);

    const context = buildElementContext(button, {
      url: "https://example.com/patients/ana@example.com/edit?token=secret&tab=profile",
      title: "Teste ana@example.com",
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
    });

    expect(context.shortSelector).toBe('button[data-testid="profile-save"]');
    expect(context.cssPath).toBe('button[data-testid="profile-save"]');
    expect(context.role).toBe("button");
    expect(context.accessibleName).toBe("Salvar alteracoes");
    expect(context.visibleText).toContain("[email]");
    expect(context.url).toContain("token=<redacted>");
    expect(context.url).not.toContain("ana@example.com");
    expect(context.pageTitle).toBe("Teste [email]");
    expect(context.similarSiblingCount).toBe(1);
    expect(context.boundingRect).toEqual({ x: 20, y: 30, width: 120, height: 40 });
    expect(context.usefulStyles).toMatchObject({
      position: "relative",
      zIndex: "3",
      display: "inline-flex",
      visibility: "visible",
      opacity: "0.72",
      pointerEvents: "auto",
      overflow: "hidden",
      isolation: "isolate",
    });
    expect(context.usefulStyles.transform).toContain("translate");
    expect(elementFromPoint).toHaveBeenCalledWith(80, 50);
    expect(context.topElementAtPoint).toEqual({
      x: 80,
      y: 50,
      label: "button.chip.primary",
      shortSelector: 'button[data-testid="profile-save"]',
    });
    expect(context.debug).toBeUndefined();
  });

  it("collects expanded debug context only when requested", () => {
    document.body.innerHTML = `
      <main>
        <button
          class="chip primary"
          data-testid="agenda-patient-search-input"
          data-component="AgendaPatientSearchInput"
          aria-label="Salvar ana@example.com"
          style="display: inline-flex; position: relative; padding: 8px 12px;"
        >Salvar ana@example.com</button>
      </main>
    `;
    const button = document.querySelector(".primary") as HTMLElement;
    button.getBoundingClientRect = () =>
      ({
        x: 20,
        y: 30,
        width: 120,
        height: 40,
        top: 30,
        left: 20,
        right: 140,
        bottom: 70,
        toJSON: () => ({}),
      }) as DOMRect;
    mockElementFromPoint(button);

    const context = buildElementContext(button, {
      debugMode: true,
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
    });

    expect(context.debug?.selectorMatches).toEqual({
      shortSelector: 1,
      cssPath: 1,
      fullCssPath: 1,
      nthOfTypePath: 1,
    });
    expect(context.debug?.fullCssPath).toContain(
      "html:nth-of-type(1) > body:nth-of-type(1) > main:nth-of-type(1)",
    );
    expect(context.debug?.attributes).toContainEqual({
      name: "data-testid",
      value: "agenda-patient-search-input",
    });
    expect(context.debug?.attributes).toContainEqual({
      name: "data-component",
      value: "AgendaPatientSearchInput",
    });
    expect(context.debug?.attributes).toContainEqual({ name: "class", value: "chip primary" });
    expect(context.debug?.attributes).toContainEqual({
      name: "aria-label",
      value: "Salvar [email]",
    });
    expect(context.debug?.computedStyles.display).toBe("inline-flex");
    expect(context.debug?.computedStyles.position).toBe("relative");
    expect(context.debug?.domPreview).toContain("Salvar [email]");
  });

  it("records null topElementAtPoint when the element has no visible area", () => {
    document.body.innerHTML = `<button style="display: none">Salvar</button>`;
    const button = document.querySelector("button") as HTMLElement;
    button.getBoundingClientRect = () =>
      ({
        x: 2000,
        y: 2000,
        width: 120,
        height: 40,
        top: 2000,
        left: 2000,
        right: 2120,
        bottom: 2040,
        toJSON: () => ({}),
      }) as DOMRect;
    const elementFromPoint = mockElementFromPoint(button);

    const context = buildElementContext(button, {
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
    });

    expect(context.topElementAtPoint).toBeNull();
    expect(elementFromPoint).not.toHaveBeenCalled();
  });
});

function mockElementFromPoint(element: Element): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() => element);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: fn,
  });
  return fn;
}
