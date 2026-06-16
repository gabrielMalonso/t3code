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
        kind: "text",
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

  it("deduplicates referenced files when serializing and extracting", () => {
    const prompt = appendFileReferencesToPrompt("Read these", [
      {
        path: "/Users/demo/Desktop/file.pdf",
        scope: "external",
        label: "file.pdf",
        kind: "pdf",
      },
      {
        path: "/Users/demo/Desktop/file.pdf",
        scope: "external",
        label: "file.pdf",
        kind: "pdf",
      },
    ]);

    expect(prompt.match(/- external: \/Users\/demo\/Desktop\/file\.pdf/g)).toHaveLength(1);

    const extracted = extractTrailingFileReferences(
      `${prompt.replace(
        "</t3code-file-references>",
        "- external: /Users/demo/Desktop/file.pdf\n</t3code-file-references>",
      )}`,
    );

    expect(extracted.fileReferences).toEqual([
      {
        path: "/Users/demo/Desktop/file.pdf",
        scope: "external",
        label: "file.pdf",
        kind: "pdf",
      },
    ]);
    expect(extracted.copyText.match(/- external: \/Users\/demo\/Desktop\/file\.pdf/g)).toHaveLength(
      1,
    );
  });
});
