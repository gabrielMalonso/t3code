import type {
  OrchestrationLatestTurn,
  OrchestrationSession,
  OrchestrationSessionStatus,
} from "@t3tools/contracts";

export function sessionStatusAllowsActiveTurn(status: OrchestrationSessionStatus): boolean {
  return status === "starting" || status === "running";
}

function staleBusyStatusFallback(
  session: Pick<OrchestrationSession, "status" | "activeTurnId">,
): OrchestrationSessionStatus {
  if (session.activeTurnId !== null) {
    return "interrupted";
  }
  return "ready";
}

export function sanitizeSessionActiveTurn<
  T extends Pick<OrchestrationSession, "status" | "activeTurnId">,
>(session: T): T {
  if (session.activeTurnId === null || sessionStatusAllowsActiveTurn(session.status)) {
    return session;
  }

  return {
    ...session,
    activeTurnId: null,
  };
}

export function sanitizeBootSessionState<
  T extends Pick<OrchestrationSession, "status" | "activeTurnId" | "updatedAt">,
>(session: T, processStartedAt: string): T {
  if (
    sessionStatusAllowsActiveTurn(session.status) &&
    Date.parse(session.updatedAt) < Date.parse(processStartedAt)
  ) {
    return {
      ...session,
      status: staleBusyStatusFallback(session),
      activeTurnId: null,
    };
  }

  return sanitizeSessionActiveTurn(session);
}

export function sanitizeBootLatestTurnState<T extends OrchestrationLatestTurn>(
  latestTurn: T,
  session: Pick<OrchestrationSession, "status" | "updatedAt"> | null,
  processStartedAt: string,
): T {
  if (latestTurn.state !== "running") {
    return latestTurn;
  }

  const staleBecauseSessionEnded =
    session !== null && !sessionStatusAllowsActiveTurn(session.status);
  const staleBecausePreBoot =
    latestTurn.startedAt !== null &&
    Date.parse(latestTurn.startedAt) < Date.parse(processStartedAt);

  if (!staleBecauseSessionEnded && !staleBecausePreBoot) {
    return latestTurn;
  }

  return {
    ...latestTurn,
    state: "interrupted",
    completedAt:
      latestTurn.completedAt ??
      session?.updatedAt ??
      latestTurn.startedAt ??
      latestTurn.requestedAt,
  };
}
