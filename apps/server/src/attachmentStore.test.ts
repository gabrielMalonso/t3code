import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  attachmentRelativePath,
  createAttachmentId,
  parseThreadSegmentFromAttachmentId,
  resolveAttachmentPathById,
} from "./attachmentStore.ts";

describe("attachmentStore", () => {
  it("sanitizes thread ids when creating attachment ids", () => {
    const attachmentId = createAttachmentId("thread.folder/unsafe space");
    expect(attachmentId).toBeTruthy();
    if (!attachmentId) {
      return;
    }

    const threadSegment = parseThreadSegmentFromAttachmentId(attachmentId);
    expect(threadSegment).toBeTruthy();
    expect(threadSegment).toMatch(/^[a-z0-9_-]+$/i);
    expect(threadSegment).not.toContain(".");
    expect(threadSegment).not.toContain("%");
    expect(threadSegment).not.toContain("/");
  });

  it("parses exact thread segments from attachment ids without prefix collisions", () => {
    const fooId = "foo-00000000-0000-4000-8000-000000000001";
    const fooBarId = "foo-bar-00000000-0000-4000-8000-000000000002";

    expect(parseThreadSegmentFromAttachmentId(fooId)).toBe("foo");
    expect(parseThreadSegmentFromAttachmentId(fooBarId)).toBe("foo-bar");
  });

  it("normalizes created thread segments to lowercase", () => {
    const attachmentId = createAttachmentId("Thread.Foo");
    expect(attachmentId).toBeTruthy();
    if (!attachmentId) {
      return;
    }
    expect(parseThreadSegmentFromAttachmentId(attachmentId)).toBe("thread-foo");
  });

  it("resolves attachment path by id using the extension that exists on disk", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-attachment-store-"));
    try {
      const attachmentId = "thread-1-attachment";
      const attachmentsDir = path.join(stateDir, "attachments");
      fs.mkdirSync(attachmentsDir, { recursive: true });
      const pngPath = path.join(attachmentsDir, `${attachmentId}.png`);
      fs.writeFileSync(pngPath, Buffer.from("hello"));

      const resolved = resolveAttachmentPathById({
        stateDir,
        attachmentId,
      });
      expect(resolved).toBe(pngPath);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("returns null when no attachment file exists for the id", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-attachment-store-"));
    try {
      const resolved = resolveAttachmentPathById({
        stateDir,
        attachmentId: "thread-1-missing",
      });
      expect(resolved).toBeNull();
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("returns correct relative path for document attachment (.pdf)", () => {
    const result = attachmentRelativePath({
      type: "document",
      id: "thread-1-00000000-0000-4000-8000-000000000001",
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(result).toBe("thread-1-00000000-0000-4000-8000-000000000001.pdf");
  });

  it("returns correct relative path for text_file attachment (.txt)", () => {
    const result = attachmentRelativePath({
      type: "text_file",
      id: "thread-1-00000000-0000-4000-8000-000000000002",
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 512,
    });
    expect(result).toBe("thread-1-00000000-0000-4000-8000-000000000002.txt");
  });

  it("resolves attachment path by .pdf extension from disk", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-attachment-store-"));
    try {
      const attachmentId = "thread-1-doc-attachment";
      const attachmentsDir = path.join(stateDir, "attachments");
      fs.mkdirSync(attachmentsDir, { recursive: true });
      const pdfPath = path.join(attachmentsDir, `${attachmentId}.pdf`);
      fs.writeFileSync(pdfPath, Buffer.from("fake-pdf-content"));

      const resolved = resolveAttachmentPathById({
        stateDir,
        attachmentId,
      });
      expect(resolved).toBe(pdfPath);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("resolves attachment path by .txt extension from disk", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-attachment-store-"));
    try {
      const attachmentId = "thread-1-text-attachment";
      const attachmentsDir = path.join(stateDir, "attachments");
      fs.mkdirSync(attachmentsDir, { recursive: true });
      const txtPath = path.join(attachmentsDir, `${attachmentId}.txt`);
      fs.writeFileSync(txtPath, Buffer.from("hello world"));

      const resolved = resolveAttachmentPathById({
        stateDir,
        attachmentId,
      });
      expect(resolved).toBe(txtPath);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
