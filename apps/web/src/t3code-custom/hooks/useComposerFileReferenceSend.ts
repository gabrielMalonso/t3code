import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, type MutableRefObject } from "react";

import { collapseExpandedComposerCursor } from "~/composer-logic";
import {
  canRestoreComposerDraftAfterSendFailure,
  cloneComposerImageForRetry,
} from "~/components/ChatView.logic";
import type { ComposerImageAttachment, DraftId } from "~/composerDraftStore";
import type { TerminalContextDraft } from "~/lib/terminalContext";

import {
  appendFileReferencesToPrompt,
  type ComposerFileReference,
  toDisplayedFileReference,
} from "../file-references";

type ComposerDraftTarget = ScopedThreadRef | DraftId;

export function useComposerFileReferenceSend(input: {
  composerDraftTarget: ComposerDraftTarget;
  workspaceRoot: string | null | undefined;
  promptRef: MutableRefObject<string>;
  composerImagesRef: MutableRefObject<ComposerImageAttachment[]>;
  composerFileReferencesRef: MutableRefObject<ComposerFileReference[]>;
  composerTerminalContextsRef: MutableRefObject<TerminalContextDraft[]>;
  setComposerDraftPrompt: (target: ComposerDraftTarget, prompt: string) => void;
  addComposerDraftImages: (target: ComposerDraftTarget, images: ComposerImageAttachment[]) => void;
  setComposerDraftFileReferences: (
    target: ComposerDraftTarget,
    references: ComposerFileReference[],
  ) => void;
  setComposerDraftTerminalContexts: (
    target: ComposerDraftTarget,
    contexts: TerminalContextDraft[],
  ) => void;
}) {
  const {
    composerDraftTarget,
    workspaceRoot,
    promptRef,
    composerImagesRef,
    composerFileReferencesRef,
    composerTerminalContextsRef,
    setComposerDraftPrompt,
    addComposerDraftImages,
    setComposerDraftFileReferences,
    setComposerDraftTerminalContexts,
  } = input;

  const appendPromptWithFileReferences = useCallback(
    (prompt: string, fileReferences: ReadonlyArray<ComposerFileReference>) =>
      appendFileReferencesToPrompt(
        prompt,
        fileReferences.map((reference) => toDisplayedFileReference(reference, workspaceRoot)),
      ),
    [workspaceRoot],
  );

  const deriveTitleSeed = useCallback(
    (input: {
      trimmedPrompt: string;
      firstImageName: string | null;
      fileReferences: ReadonlyArray<ComposerFileReference>;
      terminalContexts: ReadonlyArray<TerminalContextDraft>;
      terminalContextLabel: string | null;
    }) => {
      if (input.trimmedPrompt.length > 0) {
        return input.trimmedPrompt;
      }
      if (input.firstImageName) {
        return `Image: ${input.firstImageName}`;
      }
      if (input.fileReferences.length > 0) {
        return input.fileReferences[0]?.name ?? "Referenced file";
      }
      if (input.terminalContexts.length > 0) {
        return input.terminalContextLabel ?? "Terminal context";
      }
      return "New thread";
    },
    [],
  );

  const restoreDraftAfterSendFailure = useCallback(
    (input: {
      promptForSend: string;
      composerImagesSnapshot: ReadonlyArray<ComposerImageAttachment>;
      composerFileReferencesSnapshot: ReadonlyArray<ComposerFileReference>;
      composerTerminalContextsSnapshot: ReadonlyArray<TerminalContextDraft>;
      resetCursorState: (options: {
        cursor: number;
        prompt: string;
        detectTrigger: boolean;
      }) => void;
    }) => {
      if (
        !canRestoreComposerDraftAfterSendFailure({
          prompt: promptRef.current,
          imageCount: composerImagesRef.current.length,
          fileReferenceCount: composerFileReferencesRef.current.length,
          terminalContexts: composerTerminalContextsRef.current,
        })
      ) {
        return false;
      }

      promptRef.current = input.promptForSend;
      const retryComposerImages = input.composerImagesSnapshot.map(cloneComposerImageForRetry);
      composerImagesRef.current = retryComposerImages;
      composerFileReferencesRef.current = [...input.composerFileReferencesSnapshot];
      composerTerminalContextsRef.current = [...input.composerTerminalContextsSnapshot];
      setComposerDraftPrompt(composerDraftTarget, input.promptForSend);
      addComposerDraftImages(composerDraftTarget, retryComposerImages);
      setComposerDraftFileReferences(composerDraftTarget, [
        ...input.composerFileReferencesSnapshot,
      ]);
      setComposerDraftTerminalContexts(composerDraftTarget, [
        ...input.composerTerminalContextsSnapshot,
      ]);
      input.resetCursorState({
        cursor: collapseExpandedComposerCursor(input.promptForSend, input.promptForSend.length),
        prompt: input.promptForSend,
        detectTrigger: true,
      });
      return true;
    },
    [
      addComposerDraftImages,
      composerDraftTarget,
      composerFileReferencesRef,
      composerImagesRef,
      composerTerminalContextsRef,
      promptRef,
      setComposerDraftFileReferences,
      setComposerDraftPrompt,
      setComposerDraftTerminalContexts,
    ],
  );

  return {
    appendPromptWithFileReferences,
    deriveTitleSeed,
    restoreDraftAfterSendFailure,
  };
}
