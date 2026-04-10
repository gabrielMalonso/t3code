import { type EnvironmentId } from "@t3tools/contracts";
import { useCallback, useRef, type ClipboardEvent as ReactClipboardEvent } from "react";

import type { DraftThreadEnvMode } from "~/composerDraftStore";
import { toastManager } from "~/components/ui/toast";
import { readEnvironmentApi } from "~/environmentApi";
import { readLocalApi } from "~/localApi";

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
  selectionStart: number;
  selectionEnd: number;
  expandedSelectionStart: number;
  expandedSelectionEnd: number;
  terminalContextIds: string[];
};

export function useComposerPasteFileReference(input: {
  environmentId: EnvironmentId;
  threadId: string;
  workspaceRoot: string | null | undefined;
  pendingUserInputCount: number;
  envMode: DraftThreadEnvMode;
  worktreePath: string | null | undefined;
  readActiveThreadId: () => string;
  readComposerSnapshot: () => ComposerSnapshot;
  setComposerPromptForThread: (nextPrompt: string) => void;
  applyComposerPromptSnapshot: (nextPrompt: string, nextExpandedCursor: number) => void;
  addComposerFileReferencesToDraft: (references: ComposerFileReference[]) => void;
  updatePendingComposerFileResolutionCount: (delta: number) => void;
}) {
  const {
    environmentId,
    threadId,
    workspaceRoot,
    pendingUserInputCount,
    envMode,
    worktreePath,
    readActiveThreadId,
    readComposerSnapshot,
    setComposerPromptForThread,
    applyComposerPromptSnapshot,
    addComposerFileReferencesToDraft,
    updatePendingComposerFileResolutionCount,
  } = input;
  const pasteWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const removePastedTextFromComposerWithRetry = useCallback(
    async (args: { pastedText: string; initialExpandedSelectionStart: number }) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const currentSnapshot = readComposerSnapshot();
        const promptWithoutPastedText = removePastedTextFromComposer({
          prompt: currentSnapshot.value,
          pastedText: args.pastedText,
          expandedSelectionStart: args.initialExpandedSelectionStart,
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
      const localApi = readLocalApi();
      const environmentApi = readEnvironmentApi(environmentId);
      if (
        !localApi ||
        !environmentApi ||
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
          const isOriginThreadActive = () => readActiveThreadId() === threadId;
          try {
            const { reference, relativePath } = await saveComposerPastedTextAsFileReference({
              workspaceRoot,
              contents: pastedText,
              writeFile: environmentApi.projects.writeFile,
            });
            if (isOriginThreadActive()) {
              await removePastedTextFromComposerWithRetry({
                pastedText,
                initialExpandedSelectionStart: pasteSnapshot.expandedSelectionStart,
              });
            }
            addComposerFileReferencesToDraft([reference]);
            toastManager.add({
              type: "success",
              title: fileReferenceCopy.paste.savedTitle,
              description: fileReferenceCopy.paste.savedDescription(relativePath),
            });
          } catch (error) {
            const restoreOriginThreadPrompt = () => {
              const restored = restorePastedTextIntoComposer({
                prompt: pasteSnapshot.value,
                pastedText,
                expandedSelectionStart: pasteSnapshot.expandedSelectionStart,
                expandedSelectionEnd: pasteSnapshot.expandedSelectionEnd,
              });
              if (isOriginThreadActive()) {
                applyComposerPromptSnapshot(restored.text, restored.expandedCursor);
              } else {
                setComposerPromptForThread(restored.text);
              }
            };

            if (!isOriginThreadActive()) {
              restoreOriginThreadPrompt();
              toastManager.add({
                type: "warning",
                title: fileReferenceCopy.paste.writeFailed,
                description: fileReferenceCopy.paste.restoredText,
              });
              return;
            }

            const currentSnapshot = readComposerSnapshot();
            if (
              shouldAutoRestoreComposerPasteSnapshot({
                initialThreadId: threadId,
                initialPrompt: pasteSnapshot.value,
                initialSelectionStart: pasteSnapshot.selectionStart,
                initialSelectionEnd: pasteSnapshot.selectionEnd,
                currentThreadId: readActiveThreadId(),
                currentPrompt: currentSnapshot.value,
                currentSelectionStart: currentSnapshot.selectionStart,
                currentSelectionEnd: currentSnapshot.selectionEnd,
              })
            ) {
              restoreOriginThreadPrompt();
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
                    expandedSelectionStart: latestSnapshot.expandedSelectionStart,
                    expandedSelectionEnd: latestSnapshot.expandedSelectionEnd,
                  });
                  if (isOriginThreadActive()) {
                    applyComposerPromptSnapshot(restored.text, restored.expandedCursor);
                    return;
                  }
                  setComposerPromptForThread(restored.text);
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
      environmentId,
      pendingUserInputCount,
      readActiveThreadId,
      readComposerSnapshot,
      removePastedTextFromComposerWithRetry,
      setComposerPromptForThread,
      threadId,
      updatePendingComposerFileResolutionCount,
      workspaceRoot,
      worktreePath,
    ],
  );
}
