import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveComposerFileReferencesFromFiles } from "./resolveFiles";

const { readLocalApiMock } = vi.hoisted(() => ({
  readLocalApiMock: vi.fn(),
}));

vi.mock("~/localApi", () => ({
  readLocalApi: readLocalApiMock,
}));

describe("resolveComposerFileReferencesFromFiles", () => {
  afterEach(() => {
    readLocalApiMock.mockReset();
  });

  it("creates path references for arbitrary file types", async () => {
    const getPathForFile = vi.fn(async (file: File) => `/Users/demo/Downloads/${file.name}`);
    readLocalApiMock.mockReturnValue({
      dialogs: {
        getPathForFile,
      },
    });

    const audio = new File(["audio"], "meeting.ogg", { type: "audio/ogg" });
    const document = new File(["doc"], "contract.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const binary = new File([new Uint8Array([1, 2, 3])], "archive.bin");

    const result = await resolveComposerFileReferencesFromFiles([audio, document, binary]);

    expect(result.errors).toEqual([]);
    expect(result.references).toEqual([
      expect.objectContaining({
        name: "meeting.ogg",
        path: "/Users/demo/Downloads/meeting.ogg",
        mimeType: "audio/ogg",
        sizeBytes: audio.size,
      }),
      expect.objectContaining({
        name: "contract.docx",
        path: "/Users/demo/Downloads/contract.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: document.size,
      }),
      expect.objectContaining({
        name: "archive.bin",
        path: "/Users/demo/Downloads/archive.bin",
        mimeType: null,
        sizeBytes: binary.size,
      }),
    ]);
  });
});
