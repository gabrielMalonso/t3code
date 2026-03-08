import { FolderIcon, LayoutListIcon } from "lucide-react";

import type { SidebarViewMode } from "../../store";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface SidebarViewToggleProps {
  viewMode: SidebarViewMode;
  onToggle: (mode: SidebarViewMode) => void;
}

export function SidebarViewToggle({ viewMode, onToggle }: SidebarViewToggleProps) {
  const nextMode: SidebarViewMode = viewMode === "project" ? "status" : "project";
  const label = viewMode === "project" ? "Group by status" : "Group by project";
  const Icon = viewMode === "project" ? LayoutListIcon : FolderIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => onToggle(nextMode)}
          >
            <Icon className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}
