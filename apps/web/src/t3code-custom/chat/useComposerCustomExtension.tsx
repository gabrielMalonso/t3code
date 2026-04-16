import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { partitionComposerFilesForDraft } from "~/components/ChatView.logic";
import type { ComposerImageAttachment, DraftId, DraftThreadEnvMode } from "~/composerDraftStore";
import { useComposerDraftStore, useComposerThreadDraft } from "~/composerDraftStore";
import { toastManager } from "~/components/ui/toast";
import { randomUUID } from "~/lib/utils";
import type { Thread } from "~/types";

import { resolveComposerFileReferencesFromFiles } from "../file-references";
import { useComposerPasteFileReference } from "../hooks";
import { ComposerCustomBodySlot } from "./ComposerCustomBodySlot";
import { ComposerCustomControlsSlot } from "./ComposerCustomControlsSlot";

type ComposerDraftTarget = ScopedThreadRef | DraftId;

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

export function useComposerCustomExtension(input: {
  composerDraftTarget: ComposerDraftTarget;
  environmentId: EnvironmentId;
  activeThreadId: ThreadId | null;
  activeThread: Thread | undefined;
  isServerThread: boolean;
  workspaceRoot: string | null | undefined;
  pendingUserInputCount: number;
  envMode: DraftThreadEnvMode;
  promptRef: React.MutableRefObject<string>;
  composerImages: ReadonlyArray<ComposerImageAttachment>;
  imageSizeLimitLabel: string;
  readComposerSnapshot: () => ComposerSnapshot;
  applyComposerPromptSnapshot: (nextPrompt: string, nextExpandedCursor: number) => void;
  setComposerDraftPrompt: (target: ComposerDraftTarget, prompt: string) => void;
  addComposerImage: (image: ComposerImageAttachment) => void;
  addComposerImagesToDraft: (images: ComposerImageAttachment[]) => void;
  removeComposerImageFromDraft: (imageId: string) => void;
  setThreadError: (threadId: ThreadId | null, error: string | null) => void;
  focusComposer: () => void;
}) {
  const {
    composerDraftTarget,
    environmentId,
    activeThreadId,
    activeThread,
    isServerThread,
    workspaceRoot,
    pendingUserInputCount,
    envMode,
    promptRef,
    composerImages,
    imageSizeLimitLabel,
    readComposerSnapshot,
    applyComposerPromptSnapshot,
    setComposerDraftPrompt,
    addComposerImage,
    addComposerImagesToDraft,
    removeComposerImageFromDraft,
    setThreadError,
    focusComposer,
  } = input;

  const composerFileReferences = useComposerThreadDraft(composerDraftTarget).fileReferences;
  const addComposerDraftFileReferences = useComposerDraftStore((store) => store.addFileReferences);
  const composerImageCountRef = useRef(composerImages.length);
  const [pendingComposerFileResolutionCount, setPendingComposerFileResolutionCount] = useState(0);
  const pendingComposerFileResolutionCountRef = useRef(0);
  const dragDepthRef = useRef(0);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);

  useEffect(() => {
    composerImageCountRef.current = composerImages.length;
  }, [composerImages.length]);

  useEffect(() => {
    composerImageCountRef.current = composerImages.length;
    pendingComposerFileResolutionCountRef.current = 0;
    setPendingComposerFileResolutionCount(0);
    dragDepthRef.current = 0;
    setIsDragOverComposer(false);
  }, [composerDraftTarget, composerImages.length]);

  const updatePendingComposerFileResolutionCount = useCallback((delta: number) => {
    pendingComposerFileResolutionCountRef.current = Math.max(
      0,
      pendingComposerFileResolutionCountRef.current + delta,
    );
    setPendingComposerFileResolutionCount(pendingComposerFileResolutionCountRef.current);
  }, []);

  const addComposerImages = useCallback(
    (files: File[]) => {
      if (!activeThreadId || files.length === 0) return;
      if (pendingUserInputCount > 0) {
        toastManager.add({
          type: "error",
          title: "Attach images after answering plan questions.",
        });
        return;
      }

      const { errors, imageFiles, nonImageFiles } = partitionComposerFilesForDraft({
        files,
        existingImageCount: composerImageCountRef.current,
        maxImages: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
        maxImageBytes: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
        imageSizeLimitLabel,
      });
      const nextImages: ComposerImageAttachment[] = imageFiles.map((file) => ({
        type: "image",
        id: randomUUID(),
        name: file.name || "image",
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl: URL.createObjectURL(file),
        file,
      }));

      if (nextImages.length === 1 && nextImages[0]) {
        composerImageCountRef.current += 1;
        addComposerImage(nextImages[0]);
      } else if (nextImages.length > 1) {
        composerImageCountRef.current += nextImages.length;
        addComposerImagesToDraft(nextImages);
      }

      if (nonImageFiles.length > 0) {
        updatePendingComposerFileResolutionCount(1);
        void resolveComposerFileReferencesFromFiles(nonImageFiles)
          .then(({ errors: referenceErrors, references }) => {
            if (references.length > 0) {
              addComposerDraftFileReferences(composerDraftTarget, references);
            }
            if (referenceErrors.length > 0) {
              errors.push(...referenceErrors);
            }
          })
          .finally(() => {
            updatePendingComposerFileResolutionCount(-1);
            setThreadError(activeThreadId, errors.at(-1) ?? null);
          });
        return;
      }

      setThreadError(activeThreadId, errors.at(-1) ?? null);
    },
    [
      activeThreadId,
      addComposerDraftFileReferences,
      addComposerImage,
      addComposerImagesToDraft,
      composerDraftTarget,
      imageSizeLimitLabel,
      pendingUserInputCount,
      setThreadError,
      updatePendingComposerFileResolutionCount,
    ],
  );

  const onComposerPasteFileReference = useComposerPasteFileReference({
    environmentId,
    threadId: activeThreadId ?? "",
    workspaceRoot,
    pendingUserInputCount,
    envMode,
    worktreePath: activeThread?.worktreePath,
    readActiveThreadId: () => activeThreadId ?? "",
    readComposerSnapshot,
    setComposerPromptForThread: (nextPrompt) => {
      if (!activeThreadId) return;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
    },
    applyComposerPromptSnapshot: (nextPrompt, nextExpandedCursor) => {
      promptRef.current = nextPrompt;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
      applyComposerPromptSnapshot(nextPrompt, nextExpandedCursor);
    },
    addComposerFileReferencesToDraft: (references) => {
      addComposerDraftFileReferences(composerDraftTarget, references);
    },
    updatePendingComposerFileResolutionCount,
  });

  const onComposerPaste = useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) return;
      const files = Array.from(event.clipboardData.files);
      if (files.length > 0) {
        const imageFiles = files.filter((file) => file.type.startsWith("image/"));
        if (imageFiles.length === 0) {
          return;
        }
        event.preventDefault();
        addComposerImages(imageFiles);
        return;
      }
      onComposerPasteFileReference(event);
    },
    [addComposerImages, onComposerPasteFileReference],
  );

  const onComposerDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOverComposer(true);
  }, []);

  const onComposerDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOverComposer(true);
  }, []);

  const onComposerDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOverComposer(false);
    }
  }, []);

  const onComposerDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverComposer(false);
      const files = Array.from(event.dataTransfer.files);
      addComposerImages(files);
      focusComposer();
    },
    [addComposerImages, focusComposer],
  );

  const bodySlot = useMemo<ReactNode>(
    () =>
      activeThreadId ? (
        <ComposerCustomBodySlot
          composerDraftTarget={composerDraftTarget}
          workspaceRoot={workspaceRoot}
          visible={pendingUserInputCount === 0}
        />
      ) : null,
    [activeThreadId, composerDraftTarget, pendingUserInputCount, workspaceRoot],
  );

  const compactControls = useMemo<ReactNode>(
    () =>
      activeThread && isServerThread ? (
        <ComposerCustomControlsSlot compact thread={activeThread} />
      ) : null,
    [activeThread, isServerThread],
  );

  const controls = useMemo<ReactNode>(
    () =>
      activeThread && isServerThread ? <ComposerCustomControlsSlot thread={activeThread} /> : null,
    [activeThread, isServerThread],
  );

  return {
    composerFileReferences,
    isResolvingFileReferences: pendingComposerFileResolutionCount > 0,
    isDragOverComposer,
    removeComposerImage: removeComposerImageFromDraft,
    onComposerPaste,
    onComposerDragEnter,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
    bodySlot,
    compactControls,
    controls,
  };
}
