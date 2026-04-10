import { describe, expect, it } from "vitest";

import {
  deriveComposerSkillSelections,
  toCodexSkillReferencesForSend,
} from "./codexSkillSelections";

describe("deriveComposerSkillSelections", () => {
  it("maps recognized prompt tokens to structured skill selections", () => {
    expect(
      deriveComposerSkillSelections({
        prompt: "Use $review please",
        availableSkills: [{ name: "review", path: "/skills/review" }],
      }),
    ).toEqual([
      {
        name: "review",
        path: "/skills/review",
        rangeStart: "Use ".length,
        rangeEnd: "Use $review".length,
      },
    ]);
  });

  it("ignores tokens that are not part of the discovered codex catalog", () => {
    expect(
      deriveComposerSkillSelections({
        prompt: "echo $HOME and $review please",
        availableSkills: [{ name: "review", path: "/skills/review" }],
      }),
    ).toEqual([
      {
        name: "review",
        path: "/skills/review",
        rangeStart: "echo $HOME and ".length,
        rangeEnd: "echo $HOME and $review".length,
      },
    ]);
  });
});

describe("toCodexSkillReferencesForSend", () => {
  it("deduplicates repeated mentions of the same skill before dispatch", () => {
    expect(
      toCodexSkillReferencesForSend([
        { name: "review", path: "/skills/review", rangeStart: 0, rangeEnd: 7 },
        { name: "review", path: "/skills/review", rangeStart: 10, rangeEnd: 17 },
      ]),
    ).toEqual([{ name: "review", path: "/skills/review" }]);
  });
});
