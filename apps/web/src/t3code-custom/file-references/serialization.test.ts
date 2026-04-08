import { describe, expect, it } from "vitest";

import { appendFileReferencesToPrompt, extractTrailingFileReferences } from "./serialization";

describe("file reference serialization", () => {
  it("round-trips a prompt with referenced files", () => {
    const prompt = appendFileReferencesToPrompt("Investigate this", [
      {
        path: "docs/plan.md",
        scope: "workspace",
        label: "plan.md",
        kind: "text",
      },
      {
        path: "/Users/demo/Desktop/file.pdf",
        scope: "external",
        label: "file.pdf",
        kind: "pdf",
      },
    ]);

    const extracted = extractTrailingFileReferences(prompt);

    expect(extracted.promptText).toBe("Investigate this");
    expect(extracted.fileReferences).toEqual([
      {
        path: "docs/plan.md",
        scope: "workspace",
        label: "plan.md",
        kind: "other",
      },
      {
        path: "/Users/demo/Desktop/file.pdf",
        scope: "external",
        label: "file.pdf",
        kind: "pdf",
      },
    ]);
    expect(extracted.copyText).toContain("Referenced files:");
    expect(extracted.copyText).not.toContain("<t3code-file-references>");
  });
});
