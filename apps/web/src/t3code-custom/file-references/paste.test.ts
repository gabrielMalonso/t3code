import { describe, expect, it, vi } from "vitest";

import {
  COMPOSER_PASTE_FILE_REFERENCE_DIRECTORY,
  buildComposerPastedTextFileRelativePath,
  createComposerFileReferenceFromWorkspaceTextFile,
  removePastedTextFromComposer,
  restorePastedTextIntoComposer,
  saveComposerPastedTextAsFileReference,
  shouldAutoRestoreComposerPasteSnapshot,
  shouldConvertComposerPastedTextToFileReference,
} from "./paste";

describe("composer pasted text file references", () => {
  it("converts only large text pastes when the workspace is ready", () => {
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: "x".repeat(2_001),
        fileCount: 0,
        workspaceRoot: "/repo/project",
        pendingUserInputCount: 0,
        envMode: "local",
        worktreePath: null,
      }),
    ).toBe(true);
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: Array.from({ length: 81 }, (_, index) => `line ${index + 1}`).join("\n"),
        fileCount: 0,
        workspaceRoot: "/repo/project",
        pendingUserInputCount: 0,
        envMode: "local",
        worktreePath: null,
      }),
    ).toBe(true);
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: "x".repeat(2_000),
        fileCount: 0,
        workspaceRoot: "/repo/project",
        pendingUserInputCount: 0,
        envMode: "local",
        worktreePath: null,
      }),
    ).toBe(false);
  });

  it("does not convert when files exist, pending input is active, workspace is missing, or worktree bootstrap is pending", () => {
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: "x".repeat(5_000),
        fileCount: 1,
        workspaceRoot: "/repo/project",
        pendingUserInputCount: 0,
        envMode: "local",
        worktreePath: null,
      }),
    ).toBe(false);
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: "x".repeat(5_000),
        fileCount: 0,
        workspaceRoot: "/repo/project",
        pendingUserInputCount: 1,
        envMode: "local",
        worktreePath: null,
      }),
    ).toBe(false);
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: "x".repeat(5_000),
        fileCount: 0,
        workspaceRoot: null,
        pendingUserInputCount: 0,
        envMode: "local",
        worktreePath: null,
      }),
    ).toBe(false);
    expect(
      shouldConvertComposerPastedTextToFileReference({
        text: "x".repeat(5_000),
        fileCount: 0,
        workspaceRoot: "/repo/project",
        pendingUserInputCount: 0,
        envMode: "worktree",
        worktreePath: null,
      }),
    ).toBe(false);
  });

  it("builds stable relative paths under the paste directory", () => {
    const relativePath = buildComposerPastedTextFileRelativePath({
      now: new Date("2026-04-09T13:24:55.000Z"),
      randomToken: "AbCd1234Z",
    });

    expect(relativePath).toBe(
      `${COMPOSER_PASTE_FILE_REFERENCE_DIRECTORY}/paste-20260409-132455-abcd1234.txt`,
    );
  });

  it("saves pasted text as a workspace file reference with an absolute path", async () => {
    const writeFile = vi.fn(async () => ({
      relativePath: ".t3code/pastes/paste-20260409-132455-abcd1234.txt",
    }));

    const result = await saveComposerPastedTextAsFileReference({
      workspaceRoot: "/repo/project",
      contents: "hello\nlogs",
      writeFile,
      now: new Date("2026-04-09T13:24:55.000Z"),
      randomToken: "AbCd1234",
      referenceId: "paste-ref-1",
    });

    expect(writeFile).toHaveBeenCalledWith({
      cwd: "/repo/project",
      relativePath: ".t3code/pastes/paste-20260409-132455-abcd1234.txt",
      contents: "hello\nlogs",
    });
    expect(result).toEqual({
      relativePath: ".t3code/pastes/paste-20260409-132455-abcd1234.txt",
      reference: {
        id: "paste-ref-1",
        name: "paste-20260409-132455-abcd1234.txt",
        path: "/repo/project/.t3code/pastes/paste-20260409-132455-abcd1234.txt",
        mimeType: "text/plain",
        sizeBytes: new TextEncoder().encode("hello\nlogs").byteLength,
      },
    });
  });

  it("normalizes a workspace text file reference for display", () => {
    expect(
      createComposerFileReferenceFromWorkspaceTextFile({
        workspaceRoot: "C:\\repo\\project",
        relativePath: ".t3code/pastes/paste-20260409-132455-abcd1234.txt",
        contents: "abc",
        id: "paste-ref-2",
      }),
    ).toEqual({
      id: "paste-ref-2",
      name: "paste-20260409-132455-abcd1234.txt",
      path: "C:\\repo\\project/.t3code/pastes/paste-20260409-132455-abcd1234.txt",
      mimeType: "text/plain",
      sizeBytes: 3,
    });
  });

  it("auto-restores only when the composer snapshot is unchanged", () => {
    expect(
      shouldAutoRestoreComposerPasteSnapshot({
        initialThreadId: "thread-a",
        initialPrompt: "prefix ",
        initialSelectionStart: 7,
        initialSelectionEnd: 7,
        currentThreadId: "thread-a",
        currentPrompt: "prefix ",
        currentSelectionStart: 7,
        currentSelectionEnd: 7,
      }),
    ).toBe(true);
    expect(
      shouldAutoRestoreComposerPasteSnapshot({
        initialThreadId: "thread-a",
        initialPrompt: "prefix ",
        initialSelectionStart: 7,
        initialSelectionEnd: 12,
        currentThreadId: "thread-a",
        currentPrompt: "prefix changed",
        currentSelectionStart: 14,
        currentSelectionEnd: 14,
      }),
    ).toBe(false);
    expect(
      shouldAutoRestoreComposerPasteSnapshot({
        initialThreadId: "thread-a",
        initialPrompt: "",
        initialSelectionStart: 0,
        initialSelectionEnd: 0,
        currentThreadId: "thread-b",
        currentPrompt: "",
        currentSelectionStart: 0,
        currentSelectionEnd: 0,
      }),
    ).toBe(false);
  });

  it("restores pasted text at the captured cursor", () => {
    expect(
      restorePastedTextIntoComposer({
        prompt: "prefix ",
        pastedText: "hello",
        expandedSelectionStart: 7,
        expandedSelectionEnd: 7,
      }),
    ).toEqual({
      text: "prefix hello",
      collapsedCursor: 12,
      expandedCursor: 12,
    });
  });

  it("restores pasted text over the captured selection", () => {
    expect(
      restorePastedTextIntoComposer({
        prompt: "prefix target suffix",
        pastedText: "hello",
        expandedSelectionStart: 7,
        expandedSelectionEnd: 13,
      }),
    ).toEqual({
      text: "prefix hello suffix",
      collapsedCursor: 12,
      expandedCursor: 12,
    });
  });

  it("removes pasted text from the composer while preserving later typing", () => {
    expect(
      removePastedTextFromComposer({
        prompt: "prefix HELLO world",
        pastedText: "HELLO",
        expandedSelectionStart: 7,
        currentExpandedCursor: 17,
      }),
    ).toEqual({
      text: "prefix  world",
      collapsedCursor: 12,
      expandedCursor: 12,
    });
  });

  it("does not remove text when the pasted segment is no longer at the captured cursor", () => {
    expect(
      removePastedTextFromComposer({
        prompt: "prefix world",
        pastedText: "HELLO",
        expandedSelectionStart: 7,
        currentExpandedCursor: 12,
      }),
    ).toBeNull();
  });
});
