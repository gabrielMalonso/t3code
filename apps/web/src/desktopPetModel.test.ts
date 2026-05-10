import { describe, expect, it } from "vitest";

import { buildDesktopPetOverlayState } from "./desktopPetModel";

describe("buildDesktopPetOverlayState", () => {
  it("builds the overlay IPC payload from settings and activity", () => {
    expect(
      buildDesktopPetOverlayState({
        activityState: {
          animation: "waiting",
          activity: {
            kind: "input-needed",
            label: "Input needed",
            title: "Thread",
          },
        },
        settings: {
          enabled: true,
          position: { x: 10, y: 20 },
        },
        position: null,
        reducedMotion: false,
      }),
    ).toMatchObject({
      visible: true,
      petId: "nimbus",
      animation: "waiting",
      activity: {
        kind: "input-needed",
        label: "Input needed",
        title: "Thread",
      },
      row: 6,
      frames: 6,
      width: 96,
      height: 104,
      x: 10,
      y: 20,
    });
  });

  it("uses live position and disables animation for reduced motion", () => {
    expect(
      buildDesktopPetOverlayState({
        activityState: {
          animation: "running",
          activity: null,
        },
        settings: {
          enabled: true,
          position: { x: 10, y: 20 },
        },
        position: { x: 30, y: 40 },
        reducedMotion: true,
      }),
    ).toMatchObject({
      durationMs: 0,
      x: 30,
      y: 40,
    });
  });
});
