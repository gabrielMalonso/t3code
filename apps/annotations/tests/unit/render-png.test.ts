import { describe, expect, it } from "vitest";
import { calculateCanvasLayout } from "../../src/shared/render-png";

describe("render png helpers", () => {
  it("calculates a crop-only canvas layout without header, comment or footer bands", () => {
    expect(calculateCanvasLayout({ x: 0, y: 0, width: 960, height: 720 })).toEqual({
      width: 960,
      height: 720,
      cropRect: { x: 0, y: 0, width: 960, height: 720 },
      renderScale: 1,
    });

    const large = calculateCanvasLayout({ x: 0, y: 0, width: 2000, height: 1000 });
    expect(large.width).toBe(1440);
    expect(large.height).toBe(720);
    expect(large.cropRect).toEqual({ x: 0, y: 0, width: 1440, height: 720 });
  });
});
