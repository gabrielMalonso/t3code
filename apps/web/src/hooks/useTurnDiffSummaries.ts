import { useMemo } from "react";
import { inferCheckpointTurnCountByTurnId } from "../session-logic";
import type { SubThread } from "../types";

export function useTurnDiffSummaries(activeSubThread: SubThread | undefined) {
  const turnDiffSummaries = useMemo(() => {
    if (!activeSubThread) {
      return [];
    }
    return activeSubThread.turnDiffSummaries;
  }, [activeSubThread]);

  const inferredCheckpointTurnCountByTurnId = useMemo(
    () => inferCheckpointTurnCountByTurnId(turnDiffSummaries),
    [turnDiffSummaries],
  );

  return { turnDiffSummaries, inferredCheckpointTurnCountByTurnId };
}
