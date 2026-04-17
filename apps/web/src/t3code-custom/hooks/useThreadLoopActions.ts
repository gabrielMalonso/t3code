import { ThreadId } from "@t3tools/contracts";
import { useCallback } from "react";

import { ensureEnvironmentApi } from "~/environmentApi";
import { newCommandId, newMessageId } from "~/lib/utils";
import { selectThreadsAcrossEnvironments, useStore } from "~/store";

function getThreadLoopTarget(threadId: ThreadId) {
  const thread = selectThreadsAcrossEnvironments(useStore.getState()).find(
    (entry) => entry.id === threadId,
  );
  if (!thread) {
    throw new Error("Loops are only available after the thread has been created.");
  }

  return {
    thread,
    api: ensureEnvironmentApi(thread.environmentId),
  };
}

export function useThreadLoopActions() {
  const upsertLoop = useCallback(
    async (
      threadId: ThreadId,
      input: {
        enabled: boolean;
        prompt: string;
        intervalMinutes: number;
      },
    ) => {
      const { api } = getThreadLoopTarget(threadId);
      await api.orchestration.dispatchCommand({
        type: "thread.loop.upsert",
        commandId: newCommandId(),
        threadId,
        enabled: input.enabled,
        prompt: input.prompt,
        intervalMinutes: input.intervalMinutes,
        createdAt: new Date().toISOString(),
      });
    },
    [],
  );

  const deleteLoop = useCallback(async (threadId: ThreadId) => {
    const { api } = getThreadLoopTarget(threadId);
    await api.orchestration.dispatchCommand({
      type: "thread.loop.delete",
      commandId: newCommandId(),
      threadId,
      createdAt: new Date().toISOString(),
    });
  }, []);

  const runLoopNow = useCallback(async (threadId: ThreadId) => {
    const { api, thread } = getThreadLoopTarget(threadId);
    if (!thread.loop) {
      throw new Error("This thread does not have a configured loop.");
    }
    if (
      thread.session &&
      (thread.session.orchestrationStatus === "running" ||
        thread.session.orchestrationStatus === "starting" ||
        thread.session.activeTurnId != null)
    ) {
      throw new Error("This thread is busy right now.");
    }
    await api.orchestration.dispatchCommand({
      type: "thread.turn.start",
      commandId: newCommandId(),
      threadId,
      message: {
        messageId: newMessageId(),
        role: "user",
        text: thread.loop.prompt,
        attachments: [],
      },
      modelSelection: thread.modelSelection,
      runtimeMode: thread.runtimeMode,
      interactionMode: thread.interactionMode,
      createdAt: new Date().toISOString(),
    });
  }, []);

  return {
    upsertLoop,
    deleteLoop,
    runLoopNow,
  };
}
