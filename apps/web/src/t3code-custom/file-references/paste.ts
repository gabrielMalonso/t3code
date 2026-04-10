import type { ProjectWriteFileResult } from "@t3tools/contracts";

import type { DraftThreadEnvMode } from "~/composerDraftStore";
import { replaceTextRange } from "~/composer-logic";
import { randomUUID } from "~/lib/utils";

import type { ComposerFileReference } from "./types";

export const COMPOSER_PASTE_FILE_REFERENCE_CHAR_THRESHOLD = 2_000;
export const COMPOSER_PASTE_FILE_REFERENCE_LINE_THRESHOLD = 80;
export const COMPOSER_PASTE_FILE_REFERENCE_DIRECTORY = ".t3code/pastes";

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
  initialThreadId: string;
  initialPrompt: string;
  initialSelectionStart: number;
  initialSelectionEnd: number;
  currentThreadId: string;
  currentPrompt: string;
  currentSelectionStart: number;
  currentSelectionEnd: number;
}): boolean {
  return (
    input.initialThreadId === input.currentThreadId &&
    input.initialPrompt === input.currentPrompt &&
    input.initialSelectionStart === input.currentSelectionStart &&
    input.initialSelectionEnd === input.currentSelectionEnd
  );
}

export function restorePastedTextIntoComposer(input: {
  prompt: string;
  pastedText: string;
  expandedSelectionStart: number;
  expandedSelectionEnd: number;
}): { text: string; collapsedCursor: number; expandedCursor: number } {
  const restored = replaceTextRange(
    input.prompt,
    input.expandedSelectionStart,
    input.expandedSelectionEnd,
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
  expandedSelectionStart: number;
  currentExpandedCursor: number;
}): { text: string; collapsedCursor: number; expandedCursor: number } | null {
  const normalizedPastedText = normalizeComposerPastedText(input.pastedText);
  const pasteStart = Math.max(0, Math.min(input.prompt.length, input.expandedSelectionStart));
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
