import { afterEach, describe, expect, it, vi } from "vitest";
import { hidePanel, renderOverlayChrome, showPanel } from "../../src/content/annotation-overlay";
import { createAnnotationsShadowRoot, ROOT_ID } from "../../src/content/shadow-root";

describe("Annotations shadow root", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates an isolated host and renders the overlay chrome", () => {
    const { host, shadow } = createAnnotationsShadowRoot(document);
    const refs = renderOverlayChrome(shadow);

    expect(host.id).toBe(ROOT_ID);
    expect(host.shadowRoot).toBe(shadow);
    expect(refs.textarea.getAttribute("aria-label")).toBe("Comentário");
    expect(refs.textarea.getAttribute("placeholder")).toBe("Ask anything.");
    expect(refs.debugButton.getAttribute("aria-label")).toBe("Debug");
    expect(refs.primaryButton.getAttribute("aria-label")).toBe("Enviar ao T3");
    expect(shadow.querySelector(".composer-field")).not.toBeNull();
    expect(shadow.querySelector(".bug-icon")).not.toBeNull();
    expect(shadow.querySelector("style")?.textContent).toContain('font-family: "DM Sans"');
    expect(shadow.querySelector("style")?.textContent).toContain("dm-sans-latin.woff2");
    expect(shadow.querySelector("style")?.textContent).toContain("--annotations-shell: #000000");
    expect(shadow.querySelector("style")?.textContent).toContain("--annotations-bg: #0a0a0a");
    expect(shadow.querySelector("style")?.textContent).toContain(
      "--annotations-composer-frame-radius: 22px",
    );
    expect(shadow.querySelector("style")?.textContent).toContain(
      "--annotations-composer-surface-radius: 20px",
    );
    expect(shadow.querySelector("style")?.textContent).toContain("transition: opacity 160ms ease");
    expect(shadow.querySelector(".label")).toBeNull();
    expect(shadow.querySelector(".secondary")).toBeNull();
    expect(shadow.querySelector(".keys")).toBeNull();
  });

  it("fades the prompt panel before removing it from layout", () => {
    const { shadow } = createAnnotationsShadowRoot(document);
    const refs = renderOverlayChrome(shadow);

    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    showPanel(refs, { x: 16, y: 16, width: 120, height: 32 });

    expect(refs.panel.style.display).toBe("block");
    expect(refs.panel.style.opacity).toBe("1");
    expect(refs.panel.dataset.visible).toBe("true");

    hidePanel(refs);

    expect(refs.panel.style.display).toBe("block");
    expect(refs.panel.style.opacity).toBe("0");
    expect(refs.panel.dataset.visible).toBe("false");

    vi.advanceTimersByTime(159);
    expect(refs.panel.style.display).toBe("block");

    vi.advanceTimersByTime(1);
    expect(refs.panel.style.display).toBe("none");
  });
});
