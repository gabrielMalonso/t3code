import type { ProviderCommandEntry, ProviderKind } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import {
  deriveComposerSkillSelections,
  toCodexSkillReferencesForSend,
} from "~/codexSkillSelections";

const EMPTY_SKILL_NAMES: ReadonlyArray<string> = Object.freeze([]);
const EMPTY_DISCOVERED_SKILLS: ReadonlyArray<ProviderCommandEntry> = Object.freeze([]);
const EMPTY_SKILL_MENU_ITEMS: ReadonlyArray<ComposerCommandItem> = Object.freeze([]);
const EMPTY_SELECTED_SKILLS: ReadonlyArray<{ name: string; path: string }> = Object.freeze([]);

export function useComposerSkillExtension(input: {
  selectedProvider: ProviderKind;
  prompt: string;
  discoveredProviderSkills: ReadonlyArray<ProviderCommandEntry>;
}) {
  const { selectedProvider, prompt, discoveredProviderSkills } = input;

  const codexDiscoveredSkills = useMemo(
    () =>
      selectedProvider === "codex"
        ? discoveredProviderSkills.filter((entry) => typeof entry.path === "string")
        : EMPTY_DISCOVERED_SKILLS,
    [discoveredProviderSkills, selectedProvider],
  );

  const skillNames = useMemo(
    () =>
      selectedProvider === "codex"
        ? codexDiscoveredSkills.map((entry) => entry.name)
        : EMPTY_SKILL_NAMES,
    [codexDiscoveredSkills, selectedProvider],
  );
  const customTokenTexts = useMemo(
    () => skillNames.map((skillName) => `$${skillName}`),
    [skillNames],
  );

  const skillSelections = useMemo(
    () =>
      selectedProvider === "codex"
        ? deriveComposerSkillSelections({
            prompt,
            availableSkills: codexDiscoveredSkills,
          })
        : [],
    [codexDiscoveredSkills, prompt, selectedProvider],
  );

  const getSkillMenuItems = useCallback(
    (query: string): ComposerCommandItem[] => {
      if (selectedProvider !== "codex") {
        return [...EMPTY_SKILL_MENU_ITEMS];
      }
      const normalizedQuery = query.trim().toLowerCase();
      const filteredSkills = !normalizedQuery
        ? codexDiscoveredSkills
        : codexDiscoveredSkills.filter((entry) =>
            `${entry.name} ${entry.description ?? ""} ${entry.path ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery),
          );
      return filteredSkills.flatMap((entry) =>
        entry.path
          ? [
              {
                id: `skill:${entry.source}:${entry.path}`,
                type: "skill" as const,
                provider: selectedProvider,
                name: entry.name,
                path: entry.path,
                label: `$${entry.name}`,
                description:
                  entry.description ||
                  (entry.source === "project" ? entry.path : `${entry.source} · ${entry.path}`),
              },
            ]
          : [],
      );
    },
    [codexDiscoveredSkills, selectedProvider],
  );

  const selectedSkills = useMemo(
    () =>
      selectedProvider === "codex"
        ? toCodexSkillReferencesForSend(skillSelections)
        : [...EMPTY_SELECTED_SKILLS],
    [selectedProvider, skillSelections],
  );

  return {
    customTokenTexts,
    selectedSkills,
    getSkillMenuItems,
  };
}
