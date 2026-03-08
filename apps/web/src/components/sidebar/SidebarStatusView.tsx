import { ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectId, ThreadId } from "@t3tools/contracts";
import type { ThreadStatusCategory } from "@t3tools/contracts";

import type { Project, Thread } from "../../types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub } from "../ui/sidebar";
import { SidebarThreadItem, type SidebarThreadItemProps } from "./SidebarThreadItem";
import {
  threadStatusPill,
  terminalStatusFromRunningIds,
  prStatusIndicator,
  type ThreadPr,
} from "./threadStatusHelpers";
import { selectThreadTerminalState } from "../../terminalStateStore";

interface StatusCategoryConfig {
  key: ThreadStatusCategory;
  label: string;
  dotClass: string;
}

const STATUS_CATEGORIES: StatusCategoryConfig[] = [
  { key: "in-progress", label: "In Progress", dotClass: "bg-sky-500 dark:bg-sky-400" },
  { key: "in-review", label: "In Review", dotClass: "bg-amber-500 dark:bg-amber-400" },
  { key: "done", label: "Done", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
  { key: "backlog", label: "Backlog", dotClass: "bg-zinc-400 dark:bg-zinc-500" },
  { key: "cancelled", label: "Cancelled", dotClass: "bg-rose-500 dark:bg-rose-400" },
];

interface SidebarStatusViewProps {
  threads: Thread[];
  projects: Project[];
  routeThreadId: ThreadId | null;
  pendingApprovalByThreadId: Map<ThreadId, boolean>;
  prByThreadId: Map<ThreadId, ThreadPr>;
  terminalStateByThreadId: Parameters<typeof selectThreadTerminalState>[0];
  renamingThreadId: ThreadId | null;
  renamingTitle: string;
  renamingCommittedRef: React.RefObject<boolean>;
  onNavigate: SidebarThreadItemProps["onNavigate"];
  onContextMenu: SidebarThreadItemProps["onContextMenu"];
  onOpenPrLink: SidebarThreadItemProps["onOpenPrLink"];
  onRenamingTitleChange: SidebarThreadItemProps["onRenamingTitleChange"];
  onRenameCommit: SidebarThreadItemProps["onRenameCommit"];
  onRenameCancel: SidebarThreadItemProps["onRenameCancel"];
}

export function SidebarStatusView({
  threads,
  projects,
  routeThreadId,
  pendingApprovalByThreadId,
  prByThreadId,
  terminalStateByThreadId,
  renamingThreadId,
  renamingTitle,
  renamingCommittedRef,
  onNavigate,
  onContextMenu,
  onOpenPrLink,
  onRenamingTitleChange,
  onRenameCommit,
  onRenameCancel,
}: SidebarStatusViewProps) {
  const projectNameById = useMemo(
    () => new Map<ProjectId, string>(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const threadsByCategory = useMemo(() => {
    const map = new Map<ThreadStatusCategory, Thread[]>();
    for (const category of STATUS_CATEGORIES) {
      map.set(category.key, []);
    }
    for (const thread of threads) {
      const category = thread.statusCategory ?? "in-progress";
      const list = map.get(category);
      if (list) {
        list.push(thread);
      } else {
        map.get("in-progress")!.push(thread);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });
    }
    return map;
  }, [threads]);

  const [collapsed, setCollapsed] = useState<ReadonlySet<ThreadStatusCategory>>(() => new Set());

  const toggleCategory = (key: ThreadStatusCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <SidebarMenu>
      {STATUS_CATEGORIES.map((category) => {
        const categoryThreads = threadsByCategory.get(category.key) ?? [];
        if (categoryThreads.length === 0) return null;
        const isOpen = !collapsed.has(category.key);

        return (
          <Collapsible
            key={category.key}
            className="group/collapsible"
            open={isOpen}
            onOpenChange={() => toggleCategory(category.key)}
          >
            <SidebarMenuItem>
              <CollapsibleTrigger
                render={
                  <SidebarMenuButton
                    size="sm"
                    className="gap-2 px-2 py-1.5 text-left hover:bg-accent"
                  />
                }
              >
                <ChevronRightIcon
                  className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span className={`h-2 w-2 rounded-full ${category.dotClass}`} />
                <span className="flex-1 truncate text-xs font-medium text-foreground/90">
                  {category.label}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  {categoryThreads.length}
                </span>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <SidebarMenuSub className="mx-1 my-0 w-full translate-x-0 gap-0 px-1.5 py-0">
                  {categoryThreads.map((thread) => {
                    const isActive = routeThreadId === thread.id;
                    const status = threadStatusPill(
                      thread,
                      pendingApprovalByThreadId.get(thread.id) === true,
                    );
                    const prStatus_ = prStatusIndicator(prByThreadId.get(thread.id) ?? null);
                    const terminalStatus = terminalStatusFromRunningIds(
                      selectThreadTerminalState(terminalStateByThreadId, thread.id)
                        .runningTerminalIds,
                    );

                    return (
                      <SidebarThreadItem
                        key={thread.id}
                        threadId={thread.id}
                        title={thread.title}
                        createdAt={thread.createdAt}
                        isActive={isActive}
                        threadStatus={status}
                        prStatus={prStatus_}
                        terminalStatus={terminalStatus}
                        isRenaming={renamingThreadId === thread.id}
                        renamingTitle={renamingTitle}
                        projectLabel={projectNameById.get(thread.projectId) ?? ""}
                        onNavigate={onNavigate}
                        onContextMenu={onContextMenu}
                        onOpenPrLink={onOpenPrLink}
                        onRenamingTitleChange={onRenamingTitleChange}
                        onRenameCommit={onRenameCommit}
                        onRenameCancel={onRenameCancel}
                        renamingCommittedRef={renamingCommittedRef}
                      />
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </SidebarMenu>
  );
}
