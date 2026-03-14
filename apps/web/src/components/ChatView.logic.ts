import {
  type CodexReasoningEffort,
  ProjectId,
  type ProviderKind,
  type SubThreadId,
  type ThreadId,
} from "@t3tools/contracts";
import { type ChatMessage, type Thread } from "../types";
import { randomUUID } from "~/lib/utils";
import { getAppModelOptions } from "../appSettings";
import { type ComposerImageAttachment, type DraftThreadState } from "../composerDraftStore";
import { Schema } from "effect";

export const LAST_INVOKED_SCRIPT_BY_PROJECT_KEY = "t3code:last-invoked-script-by-project";

export const reasoningLabelByOption: Record<CodexReasoningEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
};
const WORKTREE_BRANCH_PREFIX = "t3code";

export const LastInvokedScriptByProjectSchema = Schema.Record(ProjectId, Schema.String);

export function buildLocalDraftThread(
  threadId: ThreadId,
  draftThread: DraftThreadState,
  fallbackModel: string,
  error: string | null,
): Thread {
  const defaultSubThreadId = `default-${threadId}` as SubThreadId;
  return {
    id: threadId,
    codexThreadId: null,
    projectId: draftThread.projectId,
    title: "New thread",
    error,
    createdAt: draftThread.createdAt,
    lastVisitedAt: draftThread.createdAt,
    branch: draftThread.branch,
    worktreePath: draftThread.worktreePath,
    sourceThreadId: null,
    implementationThreadId: null,
    subThreads: [
      {
        id: defaultSubThreadId,
        threadId,
        title: "Main",
        model: fallbackModel,
        runtimeMode: draftThread.runtimeMode,
        interactionMode: draftThread.interactionMode,
        session: null,
        messages: [],
        proposedPlans: [],
        latestTurn: null,
        turnDiffSummaries: [],
        activities: [],
        createdAt: draftThread.createdAt,
      },
    ],
    activeSubThreadId: defaultSubThreadId,
  };
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

export type SendPhase = "idle" | "preparing-worktree" | "sending-turn";

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

import {
  SUPPORTED_DOCUMENT_MIME_TYPES,
  SUPPORTED_TEXT_FILE_MIME_TYPES,
  SUPPORTED_TEXT_FILE_EXTENSIONS,
} from "@t3tools/shared/fileMime";

export function classifyFile(file: File): "image" | "document" | "text_file" | null {
  if (file.type.startsWith("image/")) return "image";
  if (SUPPORTED_DOCUMENT_MIME_TYPES.has(file.type)) return "document";
  if (SUPPORTED_TEXT_FILE_MIME_TYPES.has(file.type)) return "text_file";
  // Fallback: check extension for files with empty/generic MIME type (e.g. .log files).
  const dotIndex = file.name.lastIndexOf(".");
  if (dotIndex > 0) {
    const ext = file.name.slice(dotIndex).toLowerCase();
    if (SUPPORTED_TEXT_FILE_EXTENSIONS.has(ext)) return "text_file";
  }
  return null;
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

export function getCustomModelOptionsByProvider(settings: {
  customCodexModels: readonly string[];
  customClaudeModels?: readonly string[];
  customCursorModels?: readonly string[];
}): Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>> {
  return {
    codex: getAppModelOptions("codex", settings.customCodexModels),
    claudeCode: getAppModelOptions("claudeCode", settings.customClaudeModels ?? []),
    cursor: getAppModelOptions("cursor", settings.customCursorModels ?? []),
  };
}
