import { describe, expect, it } from "vitest";

import { isElectronUserAgent } from "./env";

describe("isElectronUserAgent", () => {
  it("detects Electron renderer user agents", () => {
    expect(
      isElectronUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) T3Code/0.0.23 Chrome/142.0.0.0 Electron/41.5.0 Safari/537.36",
      ),
    ).toBe(true);
  });

  it("does not classify regular browsers as Electron", () => {
    expect(
      isElectronUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15",
      ),
    ).toBe(false);
  });
});
