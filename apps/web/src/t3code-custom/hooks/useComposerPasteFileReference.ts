import { useCallback, useRef, type ClipboardEvent as ReactClipboardEvent } from "react";

import type { DraftThreadEnvMode } from "~/composerDraftStore";
import { toastManager } from "~/components/ui/toast";
import { readNativeApi } from "~/nativeApi";

import {
  fileReferenceCopy,
  removePastedTextFromComposer,
  restorePastedTextIntoComposer,
  saveComposerPastedTextAsFileReference,
  shouldAutoRestoreComposerPasteSnapshot,
  shouldConvertComposerPastedTextToFileReference,
  type ComposerFileReference,
} from "../file-references";

type ComposerSnapshot = {
  value: string;
  cursor: number;
  expandedCursor: number;
  terminalContextIds: string[];
};

export function useComposerPasteFileReference(input: {
  workspaceRoot: string | null | undefined;
  pendingUserInputCount: number;
  envMode: DraftThreadEnvMode;
  worktreePath: string | null | undefined;
  readComposerSnapshot: () => ComposerSnapshot;
  applyComposerPromptSnapshot: (nextPrompt: string, nextExpandedCursor: number) => void;
  addComposerFileReferencesToDraft: (references: ComposerFileReference[]) => void;
  updatePendingComposerFileResolutionCount: (delta: number) => void;
}) {
  const {
    workspaceRoot,
    pendingUserInputCount,
    envMode,
    worktreePath,
    readComposerSnapshot,
    applyComposerPromptSnapshot,
    addComposerFileReferencesToDraft,
    updatePendingComposerFileResolutionCount,
  } = input;
  const pasteWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const removePastedTextFromComposerWithRetry = useCallback(
    async (args: { pastedText: string; initialExpandedCursor: number }) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const currentSnapshot = readComposerSnapshot();
        const promptWithoutPastedText = removePastedTextFromComposer({
          prompt: currentSnapshot.value,
          pastedText: args.pastedText,
          expandedCursor: args.initialExpandedCursor,
          currentExpandedCursor: currentSnapshot.expandedCursor,
        });
        if (promptWithoutPastedText) {
          applyComposerPromptSnapshot(
            promptWithoutPastedText.text,
            promptWithoutPastedText.expandedCursor,
          );
          return true;
        }
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
      return false;
    },
    [applyComposerPromptSnapshot, readComposerSnapshot],
  );

  return useCallback(
    (event: ReactClipboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) {
        return false;
      }

      const files = Array.from(event.clipboardData.files);
      const pastedText = event.clipboardData.getData("text/plain");
      const api = readNativeApi();
      if (
        !api ||
        !workspaceRoot ||
        !shouldConvertComposerPastedTextToFileReference({
          text: pastedText,
          fileCount: files.length,
          workspaceRoot,
          pendingUserInputCount,
          envMode,
          worktreePath,
        })
      ) {
        return false;
      }

      const pasteSnapshot = readComposerSnapshot();
      event.preventDefault();
      updatePendingComposerFileResolutionCount(1);

      const queuedWrite = pasteWriteQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const { reference, relativePath } = await saveComposerPastedTextAsFileReference({
              workspaceRoot,
              contents: pastedText,
              writeFile: api.projects.writeFile,
            });
            await removePastedTextFromComposerWithRetry({
              pastedText,
              initialExpandedCursor: pasteSnapshot.expandedCursor,
            });
            addComposerFileReferencesToDraft([reference]);
            toastManager.add({
              type: "success",
              title: fileReferenceCopy.paste.savedTitle,
              description: fileReferenceCopy.paste.savedDescription(relativePath),
            });
          } catch (error) {
            const currentSnapshot = readComposerSnapshot();
            if (
              shouldAutoRestoreComposerPasteSnapshot({
                initialPrompt: pasteSnapshot.value,
                initialCursor: pasteSnapshot.cursor,
                currentPrompt: currentSnapshot.value,
                currentCursor: currentSnapshot.cursor,
              })
            ) {
              const restored = restorePastedTextIntoComposer({
                prompt: pasteSnapshot.value,
                pastedText,
                expandedCursor: pasteSnapshot.expandedCursor,
              });
              applyComposerPromptSnapshot(restored.text, restored.expandedCursor);
              toastManager.add({
                type: "warning",
                title: fileReferenceCopy.paste.writeFailed,
                description: fileReferenceCopy.paste.restoredText,
              });
              return;
            }

            toastManager.add({
              type: "error",
              title: fileReferenceCopy.paste.writeFailed,
              description:
                error instanceof Error ? error.message : fileReferenceCopy.paste.writeFailed,
              actionProps: {
                children: fileReferenceCopy.paste.restoreAction,
                onClick: () => {
                  const latestSnapshot = readComposerSnapshot();
                  const restored = restorePastedTextIntoComposer({
                    prompt: latestSnapshot.value,
                    pastedText,
                    expandedCursor: latestSnapshot.expandedCursor,
                  });
                  applyComposerPromptSnapshot(restored.text, restored.expandedCursor);
                },
              },
            });
          } finally {
            updatePendingComposerFileResolutionCount(-1);
          }
        });

      pasteWriteQueueRef.current = queuedWrite.then(
        () => undefined,
        () => undefined,
      );
      return true;
    },
    [
      addComposerFileReferencesToDraft,
      applyComposerPromptSnapshot,
      envMode,
      pendingUserInputCount,
      readComposerSnapshot,
      removePastedTextFromComposerWithRetry,
      updatePendingComposerFileResolutionCount,
      workspaceRoot,
      worktreePath,
    ],
  );
}
