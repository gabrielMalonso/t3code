import { describe, expect, it } from "vitest";

import { resolveDesktopPetActivity } from "./desktopPetActivity";
import type { SidebarThreadSummary } from "./types";

function makeThread(overrides: Partial<SidebarThreadSummary>): SidebarThreadSummary {
  return {
    archivedAt: null,
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    latestTurn: null,
    session: null,
    title: "Thread",
    updatedAt: "2026-05-06T10:00:00.000Z",
    ...overrides,
  } as SidebarThreadSummary;
}

describe("resolveDesktopPetActivity", () => {
  it("prioritizes input-needed over other states", () => {
    expect(
      resolveDesktopPetActivity([
        makeThread({
          title: "Working thread",
          session: {
            status: "running",
            orchestrationStatus: "running",
          } as SidebarThreadSummary["session"],
        }),
        makeThread({
          title: "Approval thread",
          hasPendingApprovals: true,
          updatedAt: "2026-05-06T11:00:00.000Z",
        }),
      ]),
    ).toEqual({
      animation: "waiting",
      activity: {
        kind: "input-needed",
        label: "Input needed",
        title: "Approval thread",
      },
    });
  });

  it("ignores archived threads", () => {
    expect(
      resolveDesktopPetActivity([
        makeThread({
          archivedAt: "2026-05-06T10:00:00.000Z",
          hasPendingUserInput: true,
        }),
      ]),
    ).toEqual({
      animation: "idle",
      activity: null,
    });
  });

  it("uses review and working states when there is no pending input", () => {
    expect(
      resolveDesktopPetActivity([
        makeThread({
          title: "Review me",
          hasActionableProposedPlan: true,
        }),
      ]),
    ).toMatchObject({
      animation: "review",
      activity: { kind: "working", label: "Review ready", title: "Review me" },
    });

    expect(
      resolveDesktopPetActivity([
        makeThread({
          title: "Running",
          latestTurn: { state: "running" } as SidebarThreadSummary["latestTurn"],
        }),
      ]),
    ).toMatchObject({
      animation: "running",
      activity: { kind: "working", label: "Working", title: "Running" },
    });
  });
});
