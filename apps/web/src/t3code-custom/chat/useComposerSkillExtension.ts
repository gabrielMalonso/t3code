import type { ProviderKind, ServerProviderSkill } from "@t3tools/contracts";
import { useMemo } from "react";

import {
  deriveComposerSkillSelections,
  toCodexSkillReferencesForSend,
} from "~/codexSkillSelections";

const EMPTY_AVAILABLE_SKILLS: ReadonlyArray<ServerProviderSkill> = Object.freeze([]);
const EMPTY_SELECTED_SKILLS: ReadonlyArray<{ name: string; path: string }> = Object.freeze([]);

export function useComposerSkillExtension(input: {
  selectedProvider: ProviderKind;
  prompt: string;
  availableSkills: ReadonlyArray<ServerProviderSkill>;
}) {
  const { selectedProvider, prompt, availableSkills } = input;

  const codexAvailableSkills = useMemo(
    () =>
      selectedProvider === "codex"
        ? availableSkills.filter((skill) => skill.enabled && typeof skill.path === "string")
        : EMPTY_AVAILABLE_SKILLS,
    [availableSkills, selectedProvider],
  );

  const skillSelections = useMemo(
    () =>
      selectedProvider === "codex"
        ? deriveComposerSkillSelections({
            prompt,
            availableSkills: codexAvailableSkills,
          })
        : [],
    [codexAvailableSkills, prompt, selectedProvider],
  );

  const selectedSkills = useMemo(
    () =>
      selectedProvider === "codex"
        ? toCodexSkillReferencesForSend(skillSelections)
        : [...EMPTY_SELECTED_SKILLS],
    [selectedProvider, skillSelections],
  );

  return {
    selectedSkills,
  };
}
