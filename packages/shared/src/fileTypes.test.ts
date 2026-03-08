import { describe, expect, it } from "vitest";

import { inferFileExtension, isAllowedFileExtension, isAllowedFileMimeType } from "./fileTypes";

describe("fileTypes", () => {
  it("accepts dotfiles and Dockerfile-style names from the whitelist", () => {
    expect(isAllowedFileExtension(".env")).toBe(true);
    expect(isAllowedFileExtension(".gitignore")).toBe(true);
    expect(isAllowedFileExtension("Dockerfile")).toBe(true);
  });

  it("keeps inferred extensions for whitelisted dotfiles and special filenames", () => {
    expect(inferFileExtension({ fileName: ".env", mimeType: "text/plain" })).toBe(".env");
    expect(inferFileExtension({ fileName: ".gitignore", mimeType: "text/plain" })).toBe(
      ".gitignore",
    );
    expect(inferFileExtension({ fileName: "Dockerfile", mimeType: "text/plain" })).toBe(
      ".dockerfile",
    );
  });

  it("still accepts allowed mime types independently from the file name", () => {
    expect(isAllowedFileMimeType("application/json")).toBe(true);
    expect(isAllowedFileMimeType("text/plain")).toBe(true);
    expect(isAllowedFileMimeType("application/octet-stream")).toBe(false);
  });
});
