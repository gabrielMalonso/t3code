import {
  ProjectId,
  type ModelSelection,
  type ProjectWriteFileResult,
  type ThreadId,
  type TurnId,
} from "@t3tools/contracts";
import { type ChatMessage, type SessionPhase, type Thread, type ThreadSession } from "../types";
import { randomUUID } from "~/lib/utils";
import {
  type ComposerImageAttachment,
  type DraftThreadEnvMode,
  type DraftThreadState,
} from "../composerDraftStore";
import { Schema } from "effect";
import { useStore } from "../store";
import {
  filterTerminalContextsWithText,
  stripInlineTerminalContextPlaceholders,
  type TerminalContextDraft,
} from "../lib/terminalContext";
import type { ComposerFileReference } from "../t3code-custom/file-references";
import { replaceTextRange } from "../composer-logic";

export const LAST_INVOKED_SCRIPT_BY_PROJECT_KEY = "t3code:last-invoked-script-by-project";
export const MAX_HIDDEN_MOUNTED_TERMINAL_THREADS = 10;
export const COMPOSER_PASTE_FILE_REFERENCE_CHAR_THRESHOLD = 2_000;
export const COMPOSER_PASTE_FILE_REFERENCE_LINE_THRESHOLD = 80;
export const COMPOSER_PASTE_FILE_REFERENCE_DIRECTORY = ".t3code/pastes";
const WORKTREE_BRANCH_PREFIX = "t3code";

export const LastInvokedScriptByProjectSchema = Schema.Record(ProjectId, Schema.String);

export function buildLocalDraftThread(
  threadId: ThreadId,
  draftThread: DraftThreadState,
  fallbackModelSelection: ModelSelection,
  error: string | null,
): Thread {
  return {
    id: threadId,
    codexThreadId: null,
    projectId: draftThread.projectId,
    title: "New thread",
    modelSelection: fallbackModelSelection,
    runtimeMode: draftThread.runtimeMode,
    interactionMode: draftThread.interactionMode,
    session: null,
    messages: [],
    error,
    createdAt: draftThread.createdAt,
    archivedAt: null,
    latestTurn: null,
    branch: draftThread.branch,
    worktreePath: draftThread.worktreePath,
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
  };
}

export function reconcileMountedTerminalThreadIds(input: {
  currentThreadIds: ReadonlyArray<ThreadId>;
  openThreadIds: ReadonlyArray<ThreadId>;
  activeThreadId: ThreadId | null;
  activeThreadTerminalOpen: boolean;
  maxHiddenThreadCount?: number;
}): ThreadId[] {
  const openThreadIdSet = new Set(input.openThreadIds);
  const hiddenThreadIds = input.currentThreadIds.filter(
    (threadId) => threadId !== input.activeThreadId && openThreadIdSet.has(threadId),
  );
  const maxHiddenThreadCount = Math.max(
    0,
    input.maxHiddenThreadCount ?? MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
  );
  const nextThreadIds =
    hiddenThreadIds.length > maxHiddenThreadCount
      ? hiddenThreadIds.slice(-maxHiddenThreadCount)
      : hiddenThreadIds;

  if (
    input.activeThreadId &&
    input.activeThreadTerminalOpen &&
    !nextThreadIds.includes(input.activeThreadId)
  ) {
    nextThreadIds.push(input.activeThreadId);
  }

  return nextThreadIds;
}

export function revokeBlobPreviewUrl(previewUrl: string | undefined): void {
  if (!previewUrl || typeof URL === "undefined" || !previewUrl.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(previewUrl);
}

export function revokeUserMessagePreviewUrls(message: ChatMessage): void {
  if (message.role !== "user" || !message.attachments) {
    return;
  }
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") {
      continue;
    }
    revokeBlobPreviewUrl(attachment.previewUrl);
  }
}

export function collectUserMessageBlobPreviewUrls(message: ChatMessage): string[] {
  if (message.role !== "user" || !message.attachments) {
    return [];
  }
  const previewUrls: string[] = [];
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") continue;
    if (!attachment.previewUrl || !attachment.previewUrl.startsWith("blob:")) continue;
    previewUrls.push(attachment.previewUrl);
  }
  return previewUrls;
}

export interface PullRequestDialogState {
  initialReference: string | null;
  key: number;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

export function buildTemporaryWorktreeBranchName(): string {
  // Keep the 8-hex suffix shape for backend temporary-branch detection.
  const token = randomUUID().slice(0, 8).toLowerCase();
  return `${WORKTREE_BRANCH_PREFIX}/${token}`;
}

export function cloneComposerImageForRetry(
  image: ComposerImageAttachment,
): ComposerImageAttachment {
  if (typeof URL === "undefined" || !image.previewUrl.startsWith("blob:")) {
    return image;
  }
  try {
    return {
      ...image,
      previewUrl: URL.createObjectURL(image.file),
    };
  } catch {
    return image;
  }
}

export function deriveComposerSendState(options: {
  prompt: string;
  imageCount: number;
  fileReferenceCount: number;
  terminalContexts: ReadonlyArray<TerminalContextDraft>;
}): {
  trimmedPrompt: string;
  sendableTerminalContexts: TerminalContextDraft[];
  expiredTerminalContextCount: number;
  hasSendableContent: boolean;
} {
  const trimmedPrompt = stripInlineTerminalContextPlaceholders(options.prompt).trim();
  const sendableTerminalContexts = filterTerminalContextsWithText(options.terminalContexts);
  const expiredTerminalContextCount =
    options.terminalContexts.length - sendableTerminalContexts.length;
  return {
    trimmedPrompt,
    sendableTerminalContexts,
    expiredTerminalContextCount,
    hasSendableContent:
      trimmedPrompt.length > 0 ||
      options.imageCount > 0 ||
      options.fileReferenceCount > 0 ||
      sendableTerminalContexts.length > 0,
  };
}

export function partitionComposerFilesForDraft(options: {
  files: ReadonlyArray<File>;
  existingImageCount: number;
  maxImages: number;
  maxImageBytes: number;
  imageSizeLimitLabel: string;
}): {
  imageFiles: File[];
  nonImageFiles: File[];
  errors: string[];
} {
  const imageFiles: File[] = [];
  const nonImageFiles: File[] = [];
  const errors: string[] = [];
  let nextImageCount = options.existingImageCount;
  let hitImageLimit = false;

  for (const file of options.files) {
    if (!file.type.startsWith("image/")) {
      nonImageFiles.push(file);
      continue;
    }
    if (file.size > options.maxImageBytes) {
      errors.push(`'${file.name}' exceeds the ${options.imageSizeLimitLabel} attachment limit.`);
      continue;
    }
    if (nextImageCount >= options.maxImages) {
      if (!hitImageLimit) {
        errors.push(`You can attach up to ${options.maxImages} images per message.`);
        hitImageLimit = true;
      }
      continue;
    }
    imageFiles.push(file);
    nextImageCount += 1;
  }

  return {
    imageFiles,
    nonImageFiles,
    errors,
  };
}

function countTextLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r\n?|\n/).length;
}

function normalizeComposerPastedText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function basenameOfRelativePath(pathValue: string): string {
  const normalized = pathValue.replaceAll("\\", "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

export function shouldConvertComposerPastedTextToFileReference(options: {
  text: string;
  fileCount: number;
  workspaceRoot: string | null | undefined;
  pendingUserInputCount: number;
  envMode: DraftThreadEnvMode;
  worktreePath: string | null | undefined;
}): boolean {
  if (options.fileCount > 0) {
    return false;
  }
  if (options.text.length === 0) {
    return false;
  }
  if (!options.workspaceRoot) {
    return false;
  }
  if (options.pendingUserInputCount > 0) {
    return false;
  }
  if (options.envMode === "worktree" && !options.worktreePath) {
    return false;
  }
  return (
    options.text.length > COMPOSER_PASTE_FILE_REFERENCE_CHAR_THRESHOLD ||
    countTextLines(options.text) > COMPOSER_PASTE_FILE_REFERENCE_LINE_THRESHOLD
  );
}

export function buildComposerPastedTextFileRelativePath(options?: {
  now?: Date;
  randomToken?: string;
}): string {
  const now = options?.now ?? new Date();
  const timestamp = [
    now.getUTCFullYear().toString().padStart(4, "0"),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
    "-",
    now.getUTCHours().toString().padStart(2, "0"),
    now.getUTCMinutes().toString().padStart(2, "0"),
    now.getUTCSeconds().toString().padStart(2, "0"),
  ].join("");
  const fallbackToken = randomUUID().slice(0, 8);
  const randomToken = (options?.randomToken ?? fallbackToken)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeToken = randomToken.length > 0 ? randomToken.slice(0, 8) : "paste";
  return `${COMPOSER_PASTE_FILE_REFERENCE_DIRECTORY}/paste-${timestamp}-${safeToken}.txt`;
}

export function joinWorkspaceRootAndRelativePath(
  workspaceRoot: string,
  relativePath: string,
): string {
  const trimmedWorkspaceRoot = workspaceRoot.replace(/[\\/]+$/g, "");
  const trimmedRelativePath = relativePath.replace(/^[\\/]+/g, "");
  return `${trimmedWorkspaceRoot}/${trimmedRelativePath}`;
}

export function byteLengthOfTextContents(contents: string): number {
  return new TextEncoder().encode(contents).byteLength;
}

export function createComposerFileReferenceFromWorkspaceTextFile(input: {
  workspaceRoot: string;
  relativePath: string;
  contents: string;
  id?: string;
}): ComposerFileReference {
  return {
    id: input.id ?? randomUUID(),
    name: basenameOfRelativePath(input.relativePath),
    path: joinWorkspaceRootAndRelativePath(input.workspaceRoot, input.relativePath),
    mimeType: "text/plain",
    sizeBytes: byteLengthOfTextContents(input.contents),
  };
}

export async function saveComposerPastedTextAsFileReference(input: {
  workspaceRoot: string;
  contents: string;
  writeFile: (input: {
    cwd: string;
    relativePath: string;
    contents: string;
  }) => Promise<ProjectWriteFileResult>;
  now?: Date;
  randomToken?: string;
  referenceId?: string;
}): Promise<{ reference: ComposerFileReference; relativePath: string }> {
  const relativePath = buildComposerPastedTextFileRelativePath({
    ...(input.now ? { now: input.now } : {}),
    ...(input.randomToken ? { randomToken: input.randomToken } : {}),
  });
  const result = await input.writeFile({
    cwd: input.workspaceRoot,
    relativePath,
    contents: input.contents,
  });

  return {
    relativePath: result.relativePath,
    reference: createComposerFileReferenceFromWorkspaceTextFile({
      workspaceRoot: input.workspaceRoot,
      relativePath: result.relativePath,
      contents: input.contents,
      ...(input.referenceId ? { id: input.referenceId } : {}),
    }),
  };
}

export function shouldAutoRestoreComposerPasteSnapshot(input: {
  initialPrompt: string;
  initialCursor: number;
  currentPrompt: string;
  currentCursor: number;
}): boolean {
  return input.initialPrompt === input.currentPrompt && input.initialCursor === input.currentCursor;
}

export function restorePastedTextIntoComposer(input: {
  prompt: string;
  pastedText: string;
  expandedCursor: number;
}): { text: string; collapsedCursor: number; expandedCursor: number } {
  const restored = replaceTextRange(
    input.prompt,
    input.expandedCursor,
    input.expandedCursor,
    input.pastedText,
  );
  return {
    text: restored.text,
    collapsedCursor: restored.cursor,
    expandedCursor: restored.cursor,
  };
}

export function removePastedTextFromComposer(input: {
  prompt: string;
  pastedText: string;
  expandedCursor: number;
  currentExpandedCursor: number;
}): { text: string; collapsedCursor: number; expandedCursor: number } | null {
  const normalizedPastedText = normalizeComposerPastedText(input.pastedText);
  const pasteStart = Math.max(0, Math.min(input.prompt.length, input.expandedCursor));
  const pasteEnd = pasteStart + normalizedPastedText.length;
  if (input.prompt.slice(pasteStart, pasteEnd) !== normalizedPastedText) {
    return null;
  }
  const next = replaceTextRange(input.prompt, pasteStart, pasteEnd, "");
  const nextExpandedCursor =
    input.currentExpandedCursor <= pasteStart
      ? input.currentExpandedCursor
      : input.currentExpandedCursor <= pasteEnd
        ? pasteStart
        : input.currentExpandedCursor - normalizedPastedText.length;
  return {
    text: next.text,
    collapsedCursor: nextExpandedCursor,
    expandedCursor: nextExpandedCursor,
  };
}

export function canRestoreComposerDraftAfterSendFailure(options: {
  prompt: string;
  imageCount: number;
  fileReferenceCount: number;
  terminalContexts: ReadonlyArray<TerminalContextDraft>;
}): boolean {
  return (
    options.prompt.length === 0 &&
    options.imageCount === 0 &&
    options.fileReferenceCount === 0 &&
    options.terminalContexts.length === 0
  );
}

export function buildExpiredTerminalContextToastCopy(
  expiredTerminalContextCount: number,
  variant: "omitted" | "empty",
): { title: string; description: string } {
  const count = Math.max(1, Math.floor(expiredTerminalContextCount));
  const noun = count === 1 ? "Expired terminal context" : "Expired terminal contexts";
  if (variant === "empty") {
    return {
      title: `${noun} won't be sent`,
      description: "Remove it or re-add it to include terminal output.",
    };
  }
  return {
    title: `${noun} omitted from message`,
    description: "Re-add it if you want that terminal output included.",
  };
}

export function threadHasStarted(thread: Thread | null | undefined): boolean {
  return Boolean(
    thread && (thread.latestTurn !== null || thread.messages.length > 0 || thread.session !== null),
  );
}

export async function waitForStartedServerThread(
  threadId: ThreadId,
  timeoutMs = 1_000,
): Promise<boolean> {
  const getThread = () => useStore.getState().threads.find((thread) => thread.id === threadId);
  const thread = getThread();

  if (threadHasStarted(thread)) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = useStore.subscribe((state) => {
      if (!threadHasStarted(state.threads.find((thread) => thread.id === threadId))) {
        return;
      }
      finish(true);
    });

    if (threadHasStarted(getThread())) {
      finish(true);
      return;
    }

    timeoutId = globalThis.setTimeout(() => {
      finish(false);
    }, timeoutMs);
  });
}

export interface LocalDispatchSnapshot {
  startedAt: string;
  preparingWorktree: boolean;
  latestTurnTurnId: TurnId | null;
  latestTurnRequestedAt: string | null;
  latestTurnStartedAt: string | null;
  latestTurnCompletedAt: string | null;
  sessionOrchestrationStatus: ThreadSession["orchestrationStatus"] | null;
  sessionUpdatedAt: string | null;
}

export function createLocalDispatchSnapshot(
  activeThread: Thread | undefined,
  options?: { preparingWorktree?: boolean },
): LocalDispatchSnapshot {
  const latestTurn = activeThread?.latestTurn ?? null;
  const session = activeThread?.session ?? null;
  return {
    startedAt: new Date().toISOString(),
    preparingWorktree: Boolean(options?.preparingWorktree),
    latestTurnTurnId: latestTurn?.turnId ?? null,
    latestTurnRequestedAt: latestTurn?.requestedAt ?? null,
    latestTurnStartedAt: latestTurn?.startedAt ?? null,
    latestTurnCompletedAt: latestTurn?.completedAt ?? null,
    sessionOrchestrationStatus: session?.orchestrationStatus ?? null,
    sessionUpdatedAt: session?.updatedAt ?? null,
  };
}

export function hasServerAcknowledgedLocalDispatch(input: {
  localDispatch: LocalDispatchSnapshot | null;
  phase: SessionPhase;
  latestTurn: Thread["latestTurn"] | null;
  session: Thread["session"] | null;
  hasPendingApproval: boolean;
  hasPendingUserInput: boolean;
  threadError: string | null | undefined;
}): boolean {
  if (!input.localDispatch) {
    return false;
  }
  if (
    input.phase === "running" ||
    input.hasPendingApproval ||
    input.hasPendingUserInput ||
    Boolean(input.threadError)
  ) {
    return true;
  }

  const latestTurn = input.latestTurn ?? null;
  const session = input.session ?? null;

  return (
    input.localDispatch.latestTurnTurnId !== (latestTurn?.turnId ?? null) ||
    input.localDispatch.latestTurnRequestedAt !== (latestTurn?.requestedAt ?? null) ||
    input.localDispatch.latestTurnStartedAt !== (latestTurn?.startedAt ?? null) ||
    input.localDispatch.latestTurnCompletedAt !== (latestTurn?.completedAt ?? null) ||
    input.localDispatch.sessionOrchestrationStatus !== (session?.orchestrationStatus ?? null) ||
    input.localDispatch.sessionUpdatedAt !== (session?.updatedAt ?? null)
  );
}
