import type { Thread } from "~/types";

import { ComposerThreadLoopSlot } from "./ComposerThreadLoopSlot";

type ComposerCustomControlsSlotThread = Pick<Thread, "id" | "loop">;

interface ComposerCustomControlsSlotProps {
  thread: ComposerCustomControlsSlotThread;
  compact?: boolean;
}

export function ComposerCustomControlsSlot({
  thread,
  compact = false,
}: ComposerCustomControlsSlotProps) {
  return <ComposerThreadLoopSlot compact={compact} thread={thread} />;
}
