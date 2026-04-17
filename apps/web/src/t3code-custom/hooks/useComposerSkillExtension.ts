import type { EnvironmentId, ProviderKind, ServerProviderSkill } from "@t3tools/contracts";
import { useCallback } from "react";

import { formatProviderSkillDisplayName } from "~/providerSkillPresentation";
import { searchProviderSkills } from "~/providerSkillSearch";

import { useComposerProviderSkills } from "./useComposerProviderSkills";

export function buildComposerSkillMenuItems(input: {
  provider: ProviderKind;
  skills: ReadonlyArray<ServerProviderSkill>;
  query: string;
}) {
  return searchProviderSkills(input.skills, input.query).map((skill) => ({
    id: `skill:${input.provider}:${skill.name}`,
    type: "skill" as const,
    provider: input.provider,
    skill,
    label: formatProviderSkillDisplayName(skill),
    description:
      skill.shortDescription ??
      skill.description ??
      (skill.scope ? `${skill.scope} skill` : "Run provider skill"),
  }));
}

export function useComposerSkillExtension(input: {
  environmentId: EnvironmentId;
  provider: ProviderKind;
  prompt: string;
  discoveryCwd: string | null;
  providerSkills: ReadonlyArray<ServerProviderSkill> | undefined;
}) {
  const { availableProviderSkills, selectedSkillReferences, isLoadingWorkspaceSkills } =
    useComposerProviderSkills({
      environmentId: input.environmentId,
      provider: input.provider,
      prompt: input.prompt,
      discoveryCwd: input.discoveryCwd,
      providerSkills: input.providerSkills,
    });

  const buildMenuItems = useCallback(
    (query: string) =>
      buildComposerSkillMenuItems({
        provider: input.provider,
        skills: availableProviderSkills,
        query,
      }),
    [availableProviderSkills, input.provider],
  );

  return {
    availableProviderSkills,
    selectedSkillReferences,
    isLoadingWorkspaceSkills,
    buildMenuItems,
  };
}
