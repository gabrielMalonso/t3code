import { describe, expect, it } from "vitest";

import { clampPetOverlayPosition, isSafePetId, normalizePetOverlayState } from "./petOverlay.ts";

describe("petOverlay", () => {
  it("accepts safe pet ids and rejects path-like ids", () => {
    expect(isSafePetId("nimbus")).toBe(true);
    expect(isSafePetId("pet-01")).toBe(true);
    expect(isSafePetId("../secret")).toBe(false);
    expect(isSafePetId("pet/slash")).toBe(false);
  });

  it("normalizes renderer state and resolves assets by pet id", () => {
    const state = normalizePetOverlayState(
      {
        visible: true,
        petId: "nimbus",
        displayName: "Nimbus",
        description: "Cloud pet",
        animation: "running",
        row: 7,
        frames: 99,
        durationMs: 130,
        width: 96,
        height: 104,
        columns: 8,
        rows: 9,
        x: 10.4,
        y: 20.6,
      },
      (petId) => (petId === "nimbus" ? "/tmp/nimbus/spritesheet.webp" : null),
    );

    expect(state).toMatchObject({
      visible: true,
      petId: "nimbus",
      frames: 8,
      x: 10,
      y: 21,
    });
    expect(state?.assetUrl).toBe("file:///tmp/nimbus/spritesheet.webp");
  });

  it("rejects unknown assets and invalid sprite rows", () => {
    expect(
      normalizePetOverlayState(
        {
          visible: true,
          petId: "missing",
          row: 0,
          frames: 1,
          durationMs: 100,
          width: 96,
          height: 104,
          columns: 8,
          rows: 9,
          x: 0,
          y: 0,
        },
        () => null,
      ),
    ).toBeNull();

    expect(
      normalizePetOverlayState(
        {
          visible: true,
          petId: "nimbus",
          row: 10,
          frames: 1,
          durationMs: 100,
          width: 96,
          height: 104,
          columns: 8,
          rows: 9,
          x: 0,
          y: 0,
        },
        () => "/tmp/nimbus/spritesheet.webp",
      ),
    ).toBeNull();
  });

  it("clamps restored positions into the nearest display work area", () => {
    expect(
      clampPetOverlayPosition({
        position: { x: 5_000, y: -50 },
        size: { width: 100, height: 120 },
        workAreas: [{ x: 100, y: 100, width: 500, height: 400 }],
      }),
    ).toEqual({ x: 500, y: 100 });
  });
});
