import type { ThreadId } from "@t3tools/contracts";
import { FileCode2Icon, FileTextIcon, XIcon } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { useComposerDraftStore } from "~/composerDraftStore";
import { fileReferenceCopy, toDisplayedFileReference } from "../file-references";

interface ComposerFileReferencesSlotProps {
  threadId: ThreadId;
  workspaceRoot: string | null | undefined;
  visible: boolean;
}

function fileReferenceKindLabel(pathValue: string): string {
  const lower = pathValue.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".py") ||
    lower.endsWith(".rb") ||
    lower.endsWith(".go") ||
    lower.endsWith(".rs") ||
    lower.endsWith(".java") ||
    lower.endsWith(".kt") ||
    lower.endsWith(".swift")
  ) {
    return "CODE";
  }
  return "FILE";
}

export function ComposerFileReferencesSlot({
  threadId,
  workspaceRoot,
  visible,
}: ComposerFileReferencesSlotProps) {
  const fileReferences = useComposerDraftStore(
    (store) => store.draftsByThreadId[threadId]?.fileReferences ?? [],
  );
  const removeFileReference = useComposerDraftStore((store) => store.removeFileReference);

  if (!visible || fileReferences.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {fileReferences.map((reference) => {
        const displayedReference = toDisplayedFileReference(reference, workspaceRoot);
        const Icon = displayedReference.kind === "code" ? FileCode2Icon : FileTextIcon;
        const scopeBadge =
          displayedReference.scope === "workspace"
            ? fileReferenceCopy.chip.workspaceBadge
            : fileReferenceCopy.chip.externalBadge;
        const tooltipText =
          displayedReference.scope === "workspace"
            ? fileReferenceCopy.tooltip.workspace
            : fileReferenceCopy.tooltip.external;

        return (
          <div
            key={reference.id}
            className="group flex min-h-16 min-w-0 max-w-64 items-start gap-2 rounded-lg border border-border/80 bg-background px-3 py-2"
          >
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {displayedReference.label}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {fileReferenceKindLabel(displayedReference.path)}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {scopeBadge}
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={<p className="mt-1 truncate text-xs text-muted-foreground/80" />}
                >
                  {displayedReference.path}
                </TooltipTrigger>
                <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
                  {tooltipText}
                  <br />
                  <span className="font-mono text-[11px]">{reference.path}</span>
                </TooltipPopup>
              </Tooltip>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 bg-background/80 hover:bg-background/90"
              onClick={() => removeFileReference(threadId, reference.id)}
              aria-label={fileReferenceCopy.chip.remove}
            >
              <XIcon />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
