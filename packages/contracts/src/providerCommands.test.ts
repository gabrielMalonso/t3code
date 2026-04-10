import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { ProviderCommandsListInput, ProviderCommandsListResult } from "./providerCommands";

const decodeProviderCommandsListInput = Schema.decodeUnknownSync(ProviderCommandsListInput);
const decodeProviderCommandsListResult = Schema.decodeUnknownSync(ProviderCommandsListResult);

describe("ProviderCommandsListInput", () => {
  it("accepts provider-aware discovery requests", () => {
    const parsed = decodeProviderCommandsListInput({
      provider: "codex",
      cwd: "/tmp/workspace",
    });

    expect(parsed).toEqual({
      provider: "codex",
      cwd: "/tmp/workspace",
    });
  });
});

describe("ProviderCommandsListResult", () => {
  it("accepts commands and skills with optional paths", () => {
    const parsed = decodeProviderCommandsListResult({
      provider: "claudeAgent",
      commands: [{ name: "simplify", source: "builtin", description: "Review code" }],
      skills: [
        {
          name: "design-review",
          source: "project",
          path: "/tmp/project/.claude/skills/design-review",
        },
      ],
    });

    expect(parsed.provider).toBe("claudeAgent");
    expect(parsed.commands[0]?.name).toBe("simplify");
    expect(parsed.skills[0]?.path).toBe("/tmp/project/.claude/skills/design-review");
  });
});
