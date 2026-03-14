import type { ProviderKind, ServerAvailableSkillsByProvider } from "@t3tools/contracts";

import { normalizeComposerSkillName } from "./composer-logic";

interface ResolveComposerSkillsInput {
  provider: ProviderKind;
  sessionSkills?: readonly string[] | undefined;
  sessionSlashCommands?: readonly string[] | undefined;
  availableSkillsByProvider?: ServerAvailableSkillsByProvider | null | undefined;
}

export function resolveComposerSkills(input: ResolveComposerSkillsInput): string[] {
  const rawSessionCommands =
    input.sessionSlashCommands && input.sessionSlashCommands.length > 0
      ? input.sessionSlashCommands
      : (input.sessionSkills ?? []);
  const sessionSkills = rawSessionCommands
    .map(normalizeComposerSkillName)
    .filter((commandName) => commandName.length > 0);
  const providerSkills = (input.availableSkillsByProvider?.[input.provider] ?? [])
    .map((skill) => skill.name)
    .map(normalizeComposerSkillName)
    .filter((commandName) => commandName.length > 0);
  return Array.from(new Set([...sessionSkills, ...providerSkills]));
}
