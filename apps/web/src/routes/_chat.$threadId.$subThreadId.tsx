import { type SubThreadId, ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import ChatView from "../components/ChatView";
import {
  DiffPanelSheet,
  DiffPanelInlineSidebar,
  DIFF_INLINE_LAYOUT_MEDIA_QUERY,
  LazyDiffPanel,
} from "../components/DiffPanelLayout";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { SidebarInset } from "~/components/ui/sidebar";
import { getActiveSubThread } from "../types";
import { SubThreadTabBar } from "../components/chat/SubThreadTabBar";
import { readNativeApi } from "../nativeApi";
import { newCommandId, newSubThreadId } from "../lib/utils";

function ChatSubThreadRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const navigate = useNavigate();
  const { threadId, subThreadId } = Route.useParams({
    select: (params) => ({
      threadId: ThreadId.makeUnsafe(params.threadId),
      subThreadId: params.subThreadId as SubThreadId,
    }),
  });
  const search = Route.useSearch();
  const thread = useStore((store) => store.threads.find((t) => t.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = thread !== undefined || draftThreadExists;
  const diffOpen = search.diff === "1";
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId/$subThreadId",
      params: { threadId, subThreadId },
      search: { diff: undefined },
    });
  }, [navigate, threadId, subThreadId]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId/$subThreadId",
      params: { threadId, subThreadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [navigate, threadId, subThreadId]);

  // --- Sub-thread tab bar callbacks ---
  const handleSelectSubThread = useCallback(
    (nextSubThreadId: SubThreadId) => {
      const api = readNativeApi();
      if (api && thread) {
        void api.orchestration.dispatchCommand({
          type: "thread.active-sub-thread.set",
          commandId: newCommandId(),
          threadId,
          subThreadId: nextSubThreadId,
        });
      }
      void navigate({
        to: "/$threadId/$subThreadId",
        params: { threadId, subThreadId: nextSubThreadId },
      });
    },
    [navigate, thread, threadId],
  );

  const handleCreateSubThread = useCallback(() => {
    const api = readNativeApi();
    if (!api || !thread) return;
    const activeSubThread = getActiveSubThread(thread);
    const id = newSubThreadId();
    const nextTitle = `Chat ${thread.subThreads.length + 1}`;
    void api.orchestration.dispatchCommand({
      type: "thread.sub-thread.create",
      commandId: newCommandId(),
      threadId,
      subThreadId: id,
      title: nextTitle,
      model: activeSubThread?.model ?? "default",
      runtimeMode: activeSubThread?.runtimeMode ?? "full-access",
      interactionMode: activeSubThread?.interactionMode ?? "default",
      createdAt: new Date().toISOString(),
    });
    void api.orchestration.dispatchCommand({
      type: "thread.active-sub-thread.set",
      commandId: newCommandId(),
      threadId,
      subThreadId: id,
    });
    void navigate({
      to: "/$threadId/$subThreadId",
      params: { threadId, subThreadId: id },
    });
  }, [navigate, thread, threadId]);

  const handleRenameSubThread = useCallback(
    (targetSubThreadId: SubThreadId, title: string) => {
      const api = readNativeApi();
      if (!api) return;
      void api.orchestration.dispatchCommand({
        type: "thread.sub-thread.meta.update",
        commandId: newCommandId(),
        threadId,
        subThreadId: targetSubThreadId,
        title,
      });
    },
    [threadId],
  );

  const handleCloseSubThread = useCallback(
    (targetSubThreadId: SubThreadId) => {
      const api = readNativeApi();
      if (!api || !thread) return;
      if (thread.subThreads.length <= 1) return;

      const isActive = targetSubThreadId === subThreadId;
      void api.orchestration.dispatchCommand({
        type: "thread.sub-thread.delete",
        commandId: newCommandId(),
        threadId,
        subThreadId: targetSubThreadId,
      });

      if (isActive) {
        const remaining = thread.subThreads.filter((s) => s.id !== targetSubThreadId);
        const fallback = remaining[0];
        if (fallback) {
          void api.orchestration.dispatchCommand({
            type: "thread.active-sub-thread.set",
            commandId: newCommandId(),
            threadId,
            subThreadId: fallback.id,
          });
          void navigate({
            to: "/$threadId/$subThreadId",
            params: { threadId, subThreadId: fallback.id },
          });
        }
      }
    },
    [navigate, subThreadId, thread, threadId],
  );

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
      return;
    }
  }, [navigate, routeThreadExists, threadsHydrated, threadId]);

  if (!threadsHydrated || !routeThreadExists) {
    return null;
  }

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;

  const tabBar = thread ? (
    <SubThreadTabBar
      threadId={threadId}
      subThreads={thread.subThreads}
      activeSubThreadId={subThreadId}
      onSelectSubThread={handleSelectSubThread}
      onCreateSubThread={handleCreateSubThread}
      onRenameSubThread={handleRenameSubThread}
      onCloseSubThread={handleCloseSubThread}
    />
  ) : null;

  if (!shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          {tabBar}
          <ChatView key={`${threadId}:${subThreadId}`} threadId={threadId} />
        </SidebarInset>
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          renderDiffContent={shouldRenderDiffContent}
        />
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        {tabBar}
        <ChatView key={`${threadId}:${subThreadId}`} threadId={threadId} />
      </SidebarInset>
      <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
        {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
      </DiffPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId/$subThreadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatSubThreadRouteView,
});
