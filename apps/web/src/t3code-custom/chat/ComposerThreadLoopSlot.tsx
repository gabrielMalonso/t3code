import type { Thread } from "~/types";

import { useThreadLoopActions } from "../hooks";
import ThreadLoopControl from "./ThreadLoopControl";

type ThreadLoopSlotThread = Pick<Thread, "id" | "loop">;

interface ComposerThreadLoopSlotProps {
  thread: ThreadLoopSlotThread;
  compact?: boolean;
}

export function ComposerThreadLoopSlot({ thread, compact = false }: ComposerThreadLoopSlotProps) {
  const { deleteLoop, runLoopNow, upsertLoop } = useThreadLoopActions();

  return (
    <ThreadLoopControl
      compact={compact}
      threadId={thread.id}
      loop={thread.loop}
      onUpsertLoop={upsertLoop}
      onDeleteLoop={deleteLoop}
      onRunNow={runLoopNow}
    />
  );
}
