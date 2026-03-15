import { ThreadId } from "@t3tools/contracts";
import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  useMatch,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import { getActiveSubThread } from "../types";

/**
 * Parent layout for /$threadId routes.
 *
 * When the URL already includes a $subThreadId child segment, we render
 * <Outlet /> so the child route (`_chat.$threadId.$subThreadId`) takes over.
 *
 * When the URL is just /$threadId (no child), we either:
 *  - redirect to /$threadId/$subThreadId (for server threads), or
 *  - render the DraftThreadFallback inline (for draft threads).
 */
function ChatThreadRedirectView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const thread = useStore((store) => store.threads.find((t) => t.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );

  // Check if the child sub-thread route is already matched.
  const hasChildMatch = useMatch({
    from: "/_chat/$threadId/$subThreadId",
    shouldThrow: false,
  });

  useEffect(() => {
    // Skip redirect logic when the child route is already active.
    if (hasChildMatch) return;
    if (!threadsHydrated) return;

    // If the thread doesn't exist (not a server thread and not a draft), go home
    if (!thread && !draftThreadExists) {
      void navigate({ to: "/", replace: true });
      return;
    }

    if (thread) {
      const activeSubThread = getActiveSubThread(thread);
      if (activeSubThread) {
        void navigate({
          to: "/$threadId/$subThreadId",
          params: { threadId, subThreadId: activeSubThread.id },
          search,
          replace: true,
        });
        return;
      }
    }
  }, [draftThreadExists, hasChildMatch, navigate, search, thread, threadsHydrated, threadId]);

  // When the child route is matched, render it via Outlet.
  if (hasChildMatch) return <Outlet />;

  if (!threadsHydrated) return null;

  // Draft thread: render inline. Once promoted to a server thread, the effect
  // above will redirect to the sub-thread URL.
  return <DraftThreadFallback threadId={threadId} />;
}

// Minimal fallback for draft threads that haven't been promoted to server threads yet.
// These threads don't have sub-threads — they just need the ChatView with their threadId.
import ChatView from "../components/ChatView";
import {
  DiffPanelSheet,
  DiffPanelInlineSidebar,
  DIFF_INLINE_LAYOUT_MEDIA_QUERY,
  LazyDiffPanel,
} from "../components/DiffPanelLayout";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { SidebarInset } from "~/components/ui/sidebar";

function DraftThreadFallback({ threadId }: { threadId: ThreadId }) {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const diffOpen = search.diff === "1";
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: { diff: undefined },
    });
  }, [navigate, threadId]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [navigate, threadId]);

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;

  if (!shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView key={threadId} threadId={threadId} />
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
        <ChatView key={threadId} threadId={threadId} />
      </SidebarInset>
      <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
        {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
      </DiffPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRedirectView,
});
