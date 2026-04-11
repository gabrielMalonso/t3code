import type { ProviderKind } from "@t3tools/contracts";

import type { SessionPhase } from "~/types";

export function resolveComposerPlaceholder(provider: ProviderKind, phase: SessionPhase): string {
  if (phase === "disconnected") {
    return provider === "codex"
      ? "Ask for follow-up changes or attach images"
      : "Ask for follow-up changes or attach images";
  }

  return provider === "codex"
    ? "Ask anything, @tag files/folders, or use / to show available commands"
    : "Ask anything, @tag files/folders, or use / to show available commands";
}
