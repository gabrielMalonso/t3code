import type { ThreadId } from "@t3tools/contracts";

import { ComposerFileReferencesSlot } from "./ComposerFileReferencesSlot";

interface ComposerCustomBodySlotProps {
  threadId: ThreadId;
  workspaceRoot: string | null | undefined;
  visible: boolean;
}

export function ComposerCustomBodySlot({
  threadId,
  workspaceRoot,
  visible,
}: ComposerCustomBodySlotProps) {
  return (
    <ComposerFileReferencesSlot
      threadId={threadId}
      workspaceRoot={workspaceRoot}
      visible={visible}
    />
  );
}
