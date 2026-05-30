import { describe, expect, it } from "vitest";
import {
  getCssPath,
  getFullCssPath,
  getNthOfTypePath,
  getShortSelector,
} from "../../src/shared/selectors";

describe("selector helpers", () => {
  it("builds a compact selector from tag id and classes", () => {
    document.body.innerHTML = `<div id="save-now" class="primary cta large">Salvar</div>`;
    const button = document.querySelector("div");

    expect(button).toBeTruthy();
    expect(getShortSelector(button!)).toBe("div#save-now");
  });

  it("builds structural paths when no id is available", () => {
    document.body.innerHTML = `
      <main>
        <section class="cards">
          <article class="card"></article>
          <article class="card selected"><h2>Titulo</h2></article>
        </section>
      </main>
    `;
    const heading = document.querySelector("h2");

    expect(heading).toBeTruthy();
    expect(getCssPath(heading!)).toContain(
      "article.card.selected:nth-of-type(2) > h2:nth-of-type(1)",
    );
    expect(getFullCssPath(heading!)).toContain(
      "html:nth-of-type(1) > body:nth-of-type(1) > main:nth-of-type(1)",
    );
    expect(getFullCssPath(heading!)).toContain(
      "article.card.selected:nth-of-type(2) > h2:nth-of-type(1)",
    );
    expect(getNthOfTypePath(heading!)).toContain("article:nth-of-type(2) > h2:nth-of-type(1)");
  });

  it("prefers stable product attributes over generated classes", () => {
    document.body.innerHTML = `
      <main>
        <section data-component="AgendaToolbar">
          <button data-testid="agenda-view-week" class="h-9 rounded-md px-4">Semana</button>
          <button data-slot="next-button" class="h-9 rounded-md px-4">Proxima</button>
          <button role="button" class="ghost">Hoje</button>
          <span class="text-[1.65rem] font-semibold leading-none">25</span>
        </section>
      </main>
    `;
    const button = document.querySelector("button");
    const slotButton = document.querySelector('[data-slot="next-button"]');
    const roleButton = document.querySelector('[role="button"]');
    const span = document.querySelector("span");

    expect(button).toBeTruthy();
    expect(slotButton).toBeTruthy();
    expect(roleButton).toBeTruthy();
    expect(span).toBeTruthy();
    expect(getShortSelector(button!)).toBe('button[data-testid="agenda-view-week"]');
    expect(getShortSelector(slotButton!)).toBe('button[data-slot="next-button"]');
    expect(getShortSelector(roleButton!)).toBe('button[role="button"][name="Hoje"]');
    expect(getShortSelector(span!)).toBe("span.font-semibold.leading-none");
    expect(getCssPath(span!)).toContain('section[data-component="AgendaToolbar"] > span');
  });
});
