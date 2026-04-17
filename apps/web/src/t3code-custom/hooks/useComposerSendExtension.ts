import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, type MutableRefObject } from "react";

import type { ComposerImageAttachment, DraftId } from "~/composerDraftStore";
import { appendTerminalContextsToPrompt, type TerminalContextDraft } from "~/lib/terminalContext";

import type { ComposerFileReference } from "../file-references";
import { useComposerFileReferenceSend } from "./useComposerFileReferenceSend";

type ComposerDraftTarget = ScopedThreadRef | DraftId;

export function useComposerSendExtension(input: {
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
  const fileReferenceSend = useComposerFileReferenceSend(input);

  const getBlockedSendError = useCallback((isResolvingFileReferences: boolean): string | null => {
    return isResolvingFileReferences
      ? "Espere as referencias de arquivo terminarem de resolver."
      : null;
  }, []);

  const buildTurnStartOverrides = useCallback(
    (selectedSkills: ReadonlyArray<{ name: string; path: string }>) =>
      selectedSkills.length > 0 ? { skills: [...selectedSkills] } : {},
    [],
  );

  const buildPlanFollowUpText = useCallback(
    (trimmedPrompt: string, fileReferences: ReadonlyArray<ComposerFileReference>) =>
      fileReferenceSend.appendPromptWithFileReferences(trimmedPrompt, fileReferences),
    [fileReferenceSend],
  );

  const buildMessageTextForSend = useCallback(
    (input: {
      prompt: string;
      fileReferences: ReadonlyArray<ComposerFileReference>;
      terminalContexts: ReadonlyArray<TerminalContextDraft>;
    }) =>
      appendTerminalContextsToPrompt(
        fileReferenceSend.appendPromptWithFileReferences(input.prompt, input.fileReferences),
        input.terminalContexts,
      ),
    [fileReferenceSend],
  );

  return {
    ...fileReferenceSend,
    buildTurnStartOverrides,
    buildMessageTextForSend,
    buildPlanFollowUpText,
    getBlockedSendError,
  };
}
