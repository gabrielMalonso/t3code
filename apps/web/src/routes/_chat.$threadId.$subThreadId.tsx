import { type SubThreadId, ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, type ReactNode, useCallback, useEffect, useState } from "react";

import ChatView from "../components/ChatView";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { getActiveSubThread } from "../types";
import { SubThreadTabBar } from "../components/chat/SubThreadTabBar";
import { readNativeApi } from "../nativeApi";
import { newCommandId, newSubThreadId } from "../lib/utils";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const DiffPanelSheet = (props: {
  children: ReactNode;
  diffOpen: boolean;
  onCloseDiff: () => void;
}) => {
  return (
    <Sheet
      open={props.diffOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseDiff();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  renderDiffContent: boolean;
}) => {
  const { diffOpen, onCloseDiff, onOpenDiff, renderDiffContent } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

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
