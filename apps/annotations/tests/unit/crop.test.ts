import { describe, expect, it } from "vitest";
import { computeCropPlan } from "../../src/shared/crop";
import type { ViewportInfo } from "../../src/shared/types";

const viewport: ViewportInfo = {
  width: 1000,
  height: 800,
  devicePixelRatio: 2,
  scrollX: 0,
  scrollY: 0,
  visualViewportOffsetLeft: 0,
  visualViewportOffsetTop: 0,
  visualViewportScale: 1,
};

describe("computeCropPlan", () => {
  it("derives scale from screenshot dimensions instead of DPR", () => {
    const crop = computeCropPlan(
      { x: 100, y: 80, width: 200, height: 120 },
      viewport,
      { width: 1500, height: 1200 },
      50,
    );

    expect(crop.scaleX).toBe(1.5);
    expect(crop.scaleY).toBe(1.5);
    expect(crop.source).toEqual({ x: 75, y: 45, width: 450, height: 330 });
    expect(crop.element).toEqual({ x: 75, y: 75, width: 300, height: 180 });
  });

  it("clamps crops near viewport edges", () => {
    const crop = computeCropPlan(
      { x: -20, y: 760, width: 120, height: 100 },
      viewport,
      { width: 2000, height: 1600 },
      48,
    );

    expect(crop.source.x).toBe(0);
    expect(crop.source.y).toBeGreaterThanOrEqual(0);
    expect(crop.source.x + crop.source.width).toBeLessThanOrEqual(2000);
    expect(crop.source.y + crop.source.height).toBeLessThanOrEqual(1600);
    expect(crop.visibleElement).toEqual({ x: 0, y: 760, width: 100, height: 40 });
  });

  it("can expand small selections to a wider context window", () => {
    const crop = computeCropPlan(
      { x: 950, y: 142, width: 244, height: 221 },
      { ...viewport, width: 1241, height: 1533, devicePixelRatio: 1 },
      { width: 1241, height: 1533 },
      { marginCssPx: 48, minCropCssWidth: 960, minCropCssHeight: 720 },
    );

    expect(crop.source.width).toBe(960);
    expect(crop.source.height).toBe(720);
    expect(crop.element.width).toBe(244);
    expect(crop.element.x).toBeGreaterThan(600);
  });
});
