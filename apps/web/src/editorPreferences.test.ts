import { describe, expect, it } from "vitest";

import { isPersistablePreferredEditor, resolvePreferredEditor } from "./editorPreferences";

describe("resolvePreferredEditor", () => {
  it("ignores Ghostty as a persisted file editor preference", () => {
    expect(resolvePreferredEditor(["ghostty", "vscode"], "ghostty")).toBe("vscode");
  });

  it("does not select Ghostty when it is the only available opener", () => {
    expect(resolvePreferredEditor(["ghostty"], null)).toBe(null);
  });

  it("keeps normal editors as persistable preferences", () => {
    expect(isPersistablePreferredEditor("vscode")).toBe(true);
    expect(resolvePreferredEditor(["cursor", "vscode"], "vscode")).toBe("vscode");
  });
});
