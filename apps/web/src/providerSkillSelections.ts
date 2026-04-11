import type { ServerProviderSkill } from "@t3tools/contracts";

export interface ComposerSkillSelection {
  name: string;
  path: string;
  rangeStart: number;
  rangeEnd: number;
}

const SKILL_TOKEN_REGEX = /(^|\s)\$([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s)/g;

function extractSkillInvocations(prompt: string) {
  const invocations: Array<{ name: string; rangeStart: number; rangeEnd: number }> = [];
  for (const match of prompt.matchAll(SKILL_TOKEN_REGEX)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const name = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    const rangeStart = matchIndex + prefix.length;
    const rangeEnd = rangeStart + fullMatch.length - prefix.length;
    invocations.push({ name, rangeStart, rangeEnd });
  }
  return invocations;
}

function buildSkillPathByName(
  availableSkills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "path" | "enabled">>,
): Map<string, string> {
  const pathByName = new Map<string, string>();
  for (const skill of availableSkills) {
    if (!skill.enabled || skill.path.length === 0) {
      continue;
    }
    pathByName.set(skill.name, skill.path);
  }
  return pathByName;
}

export function deriveComposerSkillSelections(input: {
  prompt: string;
  availableSkills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "path" | "enabled">>;
}): ComposerSkillSelection[] {
  const skillPathByName = buildSkillPathByName(input.availableSkills);
  return extractSkillInvocations(input.prompt).flatMap((invocation) => {
    const path = skillPathByName.get(invocation.name);
    return path
      ? [
          {
            name: invocation.name,
            path,
            rangeStart: invocation.rangeStart,
            rangeEnd: invocation.rangeEnd,
          } satisfies ComposerSkillSelection,
        ]
      : [];
  });
}

export function toProviderSkillReferencesForSend(
  selections: readonly ComposerSkillSelection[],
): Array<{ name: string; path: string }> {
  const uniqueSelections = new Map<string, { name: string; path: string }>();
  for (const selection of selections) {
    uniqueSelections.set(`${selection.name}:${selection.path}`, {
      name: selection.name,
      path: selection.path,
    });
  }
  return [...uniqueSelections.values()];
}
