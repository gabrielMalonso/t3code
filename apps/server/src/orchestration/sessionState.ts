import type { OrchestrationSession, OrchestrationSessionStatus } from "@t3tools/contracts";

export function sessionStatusAllowsActiveTurn(status: OrchestrationSessionStatus): boolean {
  return status === "starting" || status === "running";
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
