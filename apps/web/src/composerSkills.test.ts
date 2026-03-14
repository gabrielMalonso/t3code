import { describe, expect, it } from "vitest";

import { resolveComposerSkills } from "./composerSkills";

describe("resolveComposerSkills", () => {
  it("merges session skills with only the selected provider catalog", () => {
    expect(
      resolveComposerSkills({
        provider: "codex",
        sessionSkills: ["session-codex-skill"],
        availableSkillsByProvider: {
          codex: [{ name: "codex:build" }],
          claudeCode: [{ name: "claude:review" }],
          cursor: [{ name: "cursor:assist" }],
        },
      }),
    ).toEqual(["session-codex-skill", "codex:build"]);
  });

  it("prefers session slash commands and keeps Claude commands isolated", () => {
    expect(
      resolveComposerSkills({
        provider: "claudeCode",
        sessionSkills: ["session-skill"],
        sessionSlashCommands: ["/project:triage"],
        availableSkillsByProvider: {
          codex: [{ name: "codex:build" }],
          claudeCode: [{ name: "claude:review" }],
          cursor: [],
        },
      }),
    ).toEqual(["project:triage", "claude:review"]);
  });
});
