import { FileTextIcon } from "lucide-react";

import type { DisplayedFileReference } from "../file-references";
import { fileReferenceCopy } from "../file-references";

interface UserMessageFileReferencesSlotProps {
  references: ReadonlyArray<DisplayedFileReference>;
}

export function UserMessageFileReferencesSlot({ references }: UserMessageFileReferencesSlotProps) {
  if (references.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {references.map((reference) => (
        <div
          key={`${reference.scope}:${reference.path}`}
          className="flex max-w-[420px] min-w-0 items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-2.5 py-2"
        >
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium text-foreground">
                {reference.label}
              </span>
              <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {reference.scope === "workspace"
                  ? fileReferenceCopy.chip.workspaceBadge
                  : fileReferenceCopy.chip.externalBadge}
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground/80">{reference.path}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
