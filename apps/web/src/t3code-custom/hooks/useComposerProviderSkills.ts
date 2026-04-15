import type {
  EnvironmentId,
  ProviderKind,
  ServerListProviderSkillsResult,
  ServerProviderSkill,
} from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ensureEnvironmentApi } from "~/environmentApi";
import { formatProviderSkillDisplayName } from "~/providerSkillPresentation";
import { searchProviderSkills } from "~/providerSkillSearch";

const EMPTY_PROVIDER_SKILLS: ReadonlyArray<ServerProviderSkill> = Object.freeze([]);
const EMPTY_WORKSPACE_SKILLS_RESULT: ServerListProviderSkillsResult = {
  skills: [],
};
const SKILL_TOKEN_REGEX = /(^|\s)\$([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s)/g;

function mergeProviderSkills(
  preferredSkills: ReadonlyArray<ServerProviderSkill>,
  fallbackSkills: ReadonlyArray<ServerProviderSkill>,
): ReadonlyArray<ServerProviderSkill> {
  const merged = new Map<string, ServerProviderSkill>();
  for (const skill of preferredSkills) {
    merged.set(`${skill.name}:${skill.path}`, skill);
  }
  for (const skill of fallbackSkills) {
    const key = `${skill.name}:${skill.path}`;
    if (!merged.has(key)) {
      merged.set(key, skill);
    }
  }
  return [...merged.values()];
}

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
}) {
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
          },
        ]
      : [];
  });
}

export function toProviderSkillReferencesForSend(
  selections: ReadonlyArray<{ name: string; path: string }>,
) {
  const uniqueSelections = new Map<string, { name: string; path: string }>();
  for (const selection of selections) {
    uniqueSelections.set(`${selection.name}:${selection.path}`, {
      name: selection.name,
      path: selection.path,
    });
  }
  return [...uniqueSelections.values()];
}

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

export function useComposerProviderSkills(input: {
  environmentId: EnvironmentId;
  provider: ProviderKind;
  prompt: string;
  discoveryCwd: string | null;
  providerSkills: ReadonlyArray<ServerProviderSkill> | undefined;
}) {
  const workspaceProviderSkillsQuery = useQuery({
    queryKey: [
      "t3code-custom",
      "workspaceSkills",
      input.environmentId,
      input.provider,
      input.discoveryCwd,
    ] as const,
    queryFn: async () => {
      if (!input.discoveryCwd) {
        throw new Error("Workspace skill discovery is unavailable.");
      }
      return ensureEnvironmentApi(input.environmentId).server.listProviderSkills({
        provider: input.provider,
        cwd: input.discoveryCwd,
      });
    },
    enabled: input.provider === "codex" && Boolean(input.discoveryCwd),
    staleTime: 15_000,
    placeholderData: (previous) => previous ?? EMPTY_WORKSPACE_SKILLS_RESULT,
  });

  const availableProviderSkills = useMemo(
    () =>
      input.provider === "codex"
        ? mergeProviderSkills(
            workspaceProviderSkillsQuery.data?.skills ?? EMPTY_PROVIDER_SKILLS,
            input.providerSkills ?? EMPTY_PROVIDER_SKILLS,
          )
        : (input.providerSkills ?? EMPTY_PROVIDER_SKILLS),
    [input.provider, input.providerSkills, workspaceProviderSkillsQuery.data?.skills],
  );

  const selectedSkillReferences = useMemo(
    () =>
      toProviderSkillReferencesForSend(
        deriveComposerSkillSelections({
          prompt: input.prompt,
          availableSkills: availableProviderSkills,
        }),
      ),
    [availableProviderSkills, input.prompt],
  );

  return {
    availableProviderSkills,
    selectedSkillReferences,
    isLoadingWorkspaceSkills:
      input.provider === "codex" &&
      (workspaceProviderSkillsQuery.isLoading || workspaceProviderSkillsQuery.isFetching),
  };
}
