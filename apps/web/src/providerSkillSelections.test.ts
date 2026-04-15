import { describe, expect, it } from "vitest";

import {
  deriveComposerSkillSelections,
  toProviderSkillReferencesForSend,
} from "./t3code-custom/hooks/useComposerProviderSkills";

describe("providerSkillSelections", () => {
  it("maps prompt skill tokens to enabled available skills", () => {
    expect(
      deriveComposerSkillSelections({
        prompt: "Use $yt-thumb and then $yt-upload ",
        availableSkills: [
          {
            name: "yt-thumb",
            path: "/repo/.agents/skills/yt-thumb/SKILL.md",
            enabled: true,
          },
          {
            name: "yt-upload",
            path: "/repo/.agents/skills/yt-upload/SKILL.md",
            enabled: true,
          },
        ],
      }),
    ).toEqual([
      {
        name: "yt-thumb",
        path: "/repo/.agents/skills/yt-thumb/SKILL.md",
        rangeStart: 4,
        rangeEnd: 13,
      },
      {
        name: "yt-upload",
        path: "/repo/.agents/skills/yt-upload/SKILL.md",
        rangeStart: 23,
        rangeEnd: 33,
      },
    ]);
  });

  it("ignores unknown or disabled skills and deduplicates send refs", () => {
    const selections = deriveComposerSkillSelections({
      prompt: "$yt-thumb $yt-thumb $yt-upload $missing ",
      availableSkills: [
        {
          name: "yt-thumb",
          path: "/repo/.agents/skills/yt-thumb/SKILL.md",
          enabled: true,
        },
        {
          name: "yt-upload",
          path: "/repo/.agents/skills/yt-upload/SKILL.md",
          enabled: false,
        },
      ],
    });

    expect(toProviderSkillReferencesForSend(selections)).toEqual([
      {
        name: "yt-thumb",
        path: "/repo/.agents/skills/yt-thumb/SKILL.md",
      },
    ]);
  });
});
