import { describe, expect, it } from "vitest";

import { selectActivePointNShootSubscriber } from "./pointNShootComposerIntake.ts";

describe("selectActivePointNShootSubscriber", () => {
  it("selects the most recently activated chat", () => {
    expect(
      selectActivePointNShootSubscriber([
        {
          subscriberId: "older-chat",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 2,
        },
        {
          subscriberId: "newer-chat",
          activatedAtEpochMs: 200,
          registeredAtEpochMs: 1,
        },
      ]),
    ).toMatchObject({ subscriberId: "newer-chat" });
  });

  it("uses registration order as the tie breaker", () => {
    expect(
      selectActivePointNShootSubscriber([
        {
          subscriberId: "first-registration",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 1,
        },
        {
          subscriberId: "second-registration",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 2,
        },
      ]),
    ).toMatchObject({ subscriberId: "second-registration" });
  });

  it("prefers desktop subscribers over browser subscribers", () => {
    expect(
      selectActivePointNShootSubscriber([
        {
          subscriberId: "newer-browser-tab",
          activatedAtEpochMs: 300,
          registeredAtEpochMs: 2,
          clientKind: "browser",
        },
        {
          subscriberId: "visible-desktop-app",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 1,
          clientKind: "desktop",
        },
      ]),
    ).toMatchObject({ subscriberId: "visible-desktop-app" });
  });
});
