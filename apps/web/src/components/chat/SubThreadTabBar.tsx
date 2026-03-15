import type { SubThreadId, ThreadId } from "@t3tools/contracts";
import { AlertTriangleIcon, PlusIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { cn } from "~/lib/utils";
import type { SubThread } from "../../types";
import { Menu, MenuItem, MenuPopup } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SubThreadTabBarProps {
  threadId: ThreadId;
  subThreads: SubThread[];
  activeSubThreadId: SubThreadId | null;
  onSelectSubThread: (subThreadId: SubThreadId) => void;
  onCreateSubThread: () => void;
  onRenameSubThread: (subThreadId: SubThreadId, title: string) => void;
  onCloseSubThread: (subThreadId: SubThreadId) => void;
}

/**
 * Returns true when more than one sub-thread has an active (non-closed, non-null) session.
 */
function hasMultipleActiveSessions(subThreads: SubThread[]): boolean {
  let count = 0;
  for (const st of subThreads) {
    if (st.session && st.session.status !== "closed") {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

function SubThreadTab({
  subThread,
  isActive,
  canClose,
  hasActiveSession,
  onSelect,
  onClose,
  onRename,
}: {
  subThread: SubThread;
  isActive: boolean;
  canClose: boolean;
  hasActiveSession: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(subThread.title);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{
    getBoundingClientRect: () => DOMRect;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setEditValue(subThread.title);
    setIsEditing(true);
  }, [subThread.title]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed.length > 0 && trimmed !== subThread.title) {
      onRename(trimmed);
    }
  }, [editValue, onRename, subThread.title]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(subThread.title);
  }, [subThread.title]);

  const handleDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startEditing();
    },
    [startEditing],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
      }
    },
    [cancelEdit, commitEdit],
  );

  const handleContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const x = event.clientX;
    const y = event.clientY;
    setContextMenuAnchor({
      getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    });
    setContextMenuOpen(true);
  }, []);

  const handleCloseClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <>
      <button
        type="button"
        className={cn(
          "group relative flex h-8 min-w-0 max-w-48 shrink-0 cursor-pointer items-center gap-1 rounded-t-md border border-b-0 px-2.5 text-xs font-medium transition-colors select-none",
          isActive
            ? "border-border bg-background text-foreground"
            : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
        onClick={onSelect}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {hasActiveSession && (
          <span
            className={cn(
              "mr-0.5 inline-block size-1.5 shrink-0 rounded-full",
              isActive ? "bg-green-500" : "bg-green-500/60",
            )}
            title="Session active"
          />
        )}

        {isEditing ? (
          <input
            ref={inputRef}
            className="h-5 min-w-12 max-w-36 rounded bg-muted px-1 text-xs text-foreground outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleInputKeyDown}
          />
        ) : (
          <span className="truncate">{subThread.title}</span>
        )}

        {canClose && !isEditing && (
          <span
            role="button"
            tabIndex={-1}
            className={cn(
              "ml-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted",
              isActive ? "group-hover:opacity-100" : "group-hover:opacity-70",
            )}
            onClick={handleCloseClick}
          >
            <XIcon className="size-3" />
          </span>
        )}
      </button>

      {/* Context menu */}
      <Menu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <MenuPopup anchor={contextMenuAnchor} side="bottom" align="start" sideOffset={2}>
          <MenuItem
            onClick={() => {
              setContextMenuOpen(false);
              startEditing();
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            disabled={!canClose}
            onClick={() => {
              setContextMenuOpen(false);
              if (canClose) onClose();
            }}
          >
            Close
          </MenuItem>
        </MenuPopup>
      </Menu>
    </>
  );
}

export function SubThreadTabBar({
  subThreads,
  activeSubThreadId,
  onSelectSubThread,
  onCreateSubThread,
  onRenameSubThread,
  onCloseSubThread,
}: SubThreadTabBarProps) {
  const canClose = subThreads.length > 1;
  const multipleActiveSessions = hasMultipleActiveSessions(subThreads);

  return (
    <div className="flex h-9 shrink-0 items-end gap-0 border-b border-border bg-card px-1">
      {subThreads.map((subThread) => {
        const isActive = subThread.id === activeSubThreadId;
        const hasActiveSession =
          subThread.session !== null && subThread.session.status !== "closed";
        return (
          <SubThreadTab
            key={subThread.id}
            subThread={subThread}
            isActive={isActive}
            canClose={canClose}
            hasActiveSession={hasActiveSession}
            onSelect={() => {
              if (!isActive) onSelectSubThread(subThread.id);
            }}
            onClose={() => onCloseSubThread(subThread.id)}
            onRename={(title) => onRenameSubThread(subThread.id, title)}
          />
        );
      })}

      {/* New tab button */}
      <button
        type="button"
        className="ml-0.5 flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-t-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        onClick={onCreateSubThread}
        title="New sub-thread"
      >
        <PlusIcon className="size-3.5" />
      </button>

      {/* Warning when multiple sessions are active */}
      {multipleActiveSessions && (
        <Tooltip>
          <TooltipTrigger className="ml-auto mr-1 flex items-center">
            <AlertTriangleIcon className="size-3.5 text-yellow-500" />
          </TooltipTrigger>
          <TooltipPopup side="bottom" sideOffset={4}>
            Multiple sessions active -- agents may conflict on shared files
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}
