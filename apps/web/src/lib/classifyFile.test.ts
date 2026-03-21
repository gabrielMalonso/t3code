import { describe, expect, it } from "vitest";
import { classifyFile } from "./classifyFile";

describe("classifyFile", () => {
  it("returns 'image' for image/* mimeTypes", () => {
    const file = new File([""], "photo.png", { type: "image/png" });
    expect(classifyFile(file)).toBe("image");

    const jpeg = new File([""], "photo.jpg", { type: "image/jpeg" });
    expect(classifyFile(jpeg)).toBe("image");
  });

  it("returns 'document' for application/pdf", () => {
    const file = new File([""], "report.pdf", { type: "application/pdf" });
    expect(classifyFile(file)).toBe("document");
  });

  it("returns 'text_file' for text/* mimeTypes", () => {
    const file = new File([""], "readme.txt", { type: "text/plain" });
    expect(classifyFile(file)).toBe("text_file");

    const markdown = new File([""], "notes.md", { type: "text/markdown" });
    expect(classifyFile(markdown)).toBe("text_file");
  });

  it("returns 'text_file' for known extensions when mimeType is empty", () => {
    const md = new File([""], "notes.md", { type: "" });
    expect(classifyFile(md)).toBe("text_file");

    const json = new File([""], "config.json", { type: "" });
    expect(classifyFile(json)).toBe("text_file");

    const csv = new File([""], "data.csv", { type: "" });
    expect(classifyFile(csv)).toBe("text_file");

    const log = new File([""], "server.log", { type: "" });
    expect(classifyFile(log)).toBe("text_file");

    const xml = new File([""], "feed.xml", { type: "" });
    expect(classifyFile(xml)).toBe("text_file");

    const txt = new File([""], "plain.txt", { type: "" });
    expect(classifyFile(txt)).toBe("text_file");
  });

  it("returns null for unsupported types", () => {
    const zip = new File([""], "archive.zip", { type: "application/zip" });
    expect(classifyFile(zip)).toBeNull();

    const exe = new File([""], "program.exe", { type: "application/x-msdownload" });
    expect(classifyFile(exe)).toBeNull();

    const unknown = new File([""], "unknown.bin", { type: "" });
    expect(classifyFile(unknown)).toBeNull();
  });
});
