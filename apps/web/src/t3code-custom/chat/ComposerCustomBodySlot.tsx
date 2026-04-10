import type { ScopedThreadRef } from "@t3tools/contracts";

import type { DraftId } from "~/composerDraftStore";

import { ComposerFileReferencesSlot } from "./ComposerFileReferencesSlot";

interface ComposerCustomBodySlotProps {
  composerDraftTarget: ScopedThreadRef | DraftId;
  workspaceRoot: string | null | undefined;
  visible: boolean;
}

export function ComposerCustomBodySlot({
  composerDraftTarget,
  workspaceRoot,
  visible,
}: ComposerCustomBodySlotProps) {
  return (
    <ComposerFileReferencesSlot
      composerDraftTarget={composerDraftTarget}
      workspaceRoot={workspaceRoot}
      visible={visible}
    />
  );
}
