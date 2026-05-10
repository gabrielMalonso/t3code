import type { DesktopPetOverlayActivityKind } from "@t3tools/contracts";

import type { SidebarThreadSummary } from "./types";

export type DesktopPetAnimation =
  | "idle"
  | "runningRight"
  | "runningLeft"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export interface DesktopPetActivityState {
  readonly animation: DesktopPetAnimation;
  readonly activity: {
    readonly kind: DesktopPetOverlayActivityKind;
    readonly label: string;
    readonly title: string;
  } | null;
}

type DesktopPetThreadInput = Pick<
  SidebarThreadSummary,
  | "archivedAt"
  | "hasActionableProposedPlan"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "latestTurn"
  | "session"
  | "title"
  | "updatedAt"
>;

function isThreadWorking(thread: DesktopPetThreadInput): boolean {
  return (
    thread.latestTurn?.state === "running" ||
    thread.session?.status === "running" ||
    thread.session?.orchestrationStatus === "running"
  );
}

function isThreadConnecting(thread: DesktopPetThreadInput): boolean {
  return (
    thread.session?.status === "connecting" || thread.session?.orchestrationStatus === "starting"
  );
}

function activityTitle(thread: DesktopPetThreadInput): string {
  return thread.title.trim() || "Untitled thread";
}

function compareUpdatedAt(left: DesktopPetThreadInput, right: DesktopPetThreadInput): number {
  return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
}

export function resolveDesktopPetActivity(
  threads: readonly DesktopPetThreadInput[],
): DesktopPetActivityState {
  const activeThreads = threads.filter((thread) => thread.archivedAt === null);
  const inputNeeded = activeThreads
    .filter((thread) => thread.hasPendingApprovals || thread.hasPendingUserInput)
    .toSorted(compareUpdatedAt);
  if (inputNeeded[0]) {
    return {
      animation: "waiting",
      activity: {
        kind: "input-needed",
        label: inputNeeded.length === 1 ? "Input needed" : `${inputNeeded.length} chats need input`,
        title: activityTitle(inputNeeded[0]),
      },
    };
  }

  const review = activeThreads
    .filter((thread) => thread.hasActionableProposedPlan)
    .toSorted(compareUpdatedAt);
  if (review[0]) {
    return {
      animation: "review",
      activity: {
        kind: "working",
        label: review.length === 1 ? "Review ready" : `${review.length} plans ready`,
        title: activityTitle(review[0]),
      },
    };
  }

  const working = activeThreads.filter(isThreadWorking).toSorted(compareUpdatedAt);
  if (working[0]) {
    return {
      animation: "running",
      activity: {
        kind: "working",
        label: working.length === 1 ? "Working" : `${working.length} chats working`,
        title: activityTitle(working[0]),
      },
    };
  }

  const connecting = activeThreads.filter(isThreadConnecting).toSorted(compareUpdatedAt);
  if (connecting[0]) {
    return {
      animation: "idle",
      activity: {
        kind: "connecting",
        label: connecting.length === 1 ? "Connecting" : `${connecting.length} chats connecting`,
        title: activityTitle(connecting[0]),
      },
    };
  }

  return {
    animation: "idle",
    activity: null,
  };
}
