import { describe, expect, it } from "vitest";
import { renderOverlayChrome } from "../../src/content/annotation-overlay";
import { createAnnotationsShadowRoot, ROOT_ID } from "../../src/content/shadow-root";

describe("Annotations shadow root", () => {
  it("creates an isolated host and renders the overlay chrome", () => {
    const { host, shadow } = createAnnotationsShadowRoot(document);
    const refs = renderOverlayChrome(shadow);

    expect(host.id).toBe(ROOT_ID);
    expect(host.shadowRoot).toBe(shadow);
    expect(refs.textarea.getAttribute("aria-label")).toBe("Comentário");
    expect(refs.primaryButton.textContent).toBe("Enviar ao T3");
  });
});
