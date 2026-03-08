import { GitPullRequestIcon, TerminalIcon } from "lucide-react";
import { useRef } from "react";
import type { ThreadId } from "@t3tools/contracts";

import { SidebarMenuSubButton, SidebarMenuSubItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  formatRelativeTime,
  type PrStatusIndicator,
  type TerminalStatusIndicator,
  type ThreadStatusPill,
} from "./threadStatusHelpers";

export interface SidebarThreadItemProps {
  threadId: ThreadId;
  title: string;
  createdAt: string;
  isActive: boolean;
  threadStatus: ThreadStatusPill | null;
  prStatus: PrStatusIndicator | null;
  terminalStatus: TerminalStatusIndicator | null;
  isRenaming: boolean;
  renamingTitle: string;
  projectLabel?: string;
  onNavigate: (threadId: ThreadId) => void;
  onContextMenu: (threadId: ThreadId, position: { x: number; y: number }) => void;
  onOpenPrLink: (event: React.MouseEvent<HTMLElement>, url: string) => void;
  onRenamingTitleChange: (value: string) => void;
  onRenameCommit: (threadId: ThreadId, newTitle: string, originalTitle: string) => void;
  onRenameCancel: () => void;
  renamingCommittedRef: React.RefObject<boolean>;
}

export function SidebarThreadItem({
  threadId,
  title,
  createdAt,
  isActive,
  threadStatus,
  prStatus,
  terminalStatus,
  isRenaming,
  renamingTitle,
  projectLabel,
  onNavigate,
  onContextMenu,
  onOpenPrLink,
  onRenamingTitleChange,
  onRenameCommit,
  onRenameCancel,
  renamingCommittedRef,
}: SidebarThreadItemProps) {
  const renamingInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <SidebarMenuSubItem className="w-full">
      <SidebarMenuSubButton
        render={<div role="button" tabIndex={0} />}
        size="sm"
        isActive={isActive}
        className={`${projectLabel ? "h-auto py-1" : "h-7"} w-full translate-x-0 cursor-default justify-start px-2 text-left hover:bg-accent hover:text-foreground ${
          isActive
            ? "bg-accent/85 text-foreground font-medium ring-1 ring-border/70 dark:bg-accent/55 dark:ring-border/50"
            : "text-muted-foreground"
        }`}
        onClick={() => onNavigate(threadId)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onNavigate(threadId);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(threadId, {
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {prStatus && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={prStatus.tooltip}
                      className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                      onClick={(event) => {
                        onOpenPrLink(event, prStatus.url);
                      }}
                    >
                      <GitPullRequestIcon className="size-3" />
                    </button>
                  }
                />
                <TooltipPopup side="top">{prStatus.tooltip}</TooltipPopup>
              </Tooltip>
            )}
            {threadStatus && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] ${threadStatus.colorClass}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${threadStatus.dotClass} ${
                    threadStatus.pulse ? "animate-pulse" : ""
                  }`}
                />
                <span className="hidden md:inline">{threadStatus.label}</span>
              </span>
            )}
            {isRenaming ? (
              <input
                ref={(el) => {
                  if (el && renamingInputRef.current !== el) {
                    renamingInputRef.current = el;
                    el.focus();
                    el.select();
                  }
                }}
                className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
                value={renamingTitle}
                onChange={(e) => onRenamingTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    renamingCommittedRef.current = true;
                    onRenameCommit(threadId, renamingTitle, title);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    renamingCommittedRef.current = true;
                    onRenameCancel();
                  }
                }}
                onBlur={() => {
                  if (!renamingCommittedRef.current) {
                    onRenameCommit(threadId, renamingTitle, title);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
            )}
          </div>
          {projectLabel && (
            <span className="truncate text-[10px] text-muted-foreground/50">{projectLabel}</span>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {terminalStatus && (
            <span
              role="img"
              aria-label={terminalStatus.label}
              title={terminalStatus.label}
              className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
            >
              <TerminalIcon
                className={`size-3 ${terminalStatus.pulse ? "animate-pulse" : ""}`}
              />
            </span>
          )}
          <span
            className={`text-[10px] ${
              isActive ? "text-foreground/65" : "text-muted-foreground/40"
            }`}
          >
            {formatRelativeTime(createdAt)}
          </span>
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
