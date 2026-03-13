import type { ProviderKind } from "@t3tools/contracts";
import { normalizeSlashCommandName } from "@t3tools/shared/strings";
import { updateDiscoveredSkillsCache } from "./skillsCache";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values));
}

export function toolNameToRequestType(
  toolName: string,
): "command_execution_approval" | "file_change_approval" | "file_read_approval" | "unknown" {
  switch (toolName) {
    case "Bash":
      return "command_execution_approval";
    case "Edit":
    case "Write":
      return "file_change_approval";
    case "Read":
    case "Glob":
    case "Grep":
      return "file_read_approval";
    default:
      return "unknown";
  }
}

/**
 * Discovers supported slash commands from a Claude Agent SDK query instance
 * and emits a skills-discovered callback.
 *
 * Extracted from ClaudeSessionManager for reuse by the Effect-native adapter.
 */
export function discoverSupportedCommands(
  queryInstance: { supportedCommands: () => Promise<Array<{ name?: string }>> },
  provider: ProviderKind,
  cwd: string | undefined,
  onSkillsDiscovered: (skills: string[], slashCommands: string[]) => void,
): void {
  queryInstance
    .supportedCommands()
    .then((commands) => {
      const commandNames = (commands ?? [])
        .map((cmd) => cmd?.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);

      const skills = uniqueStrings(
        commandNames.map(normalizeSlashCommandName).filter((name) => name.length > 0),
      );

      if (skills.length === 0) {
        return;
      }

      if (cwd) {
        updateDiscoveredSkillsCache(cwd, provider, skills);
      }

      onSkillsDiscovered(skills, commandNames);
    })
    .catch((err) => {
      console.error("[skillsDiscovery] supportedCommands() failed:", String(err));
    });
}

/**
 * Extracts skills from a Claude SDK system message (synchronous path).
 * Returns null if no skills were found.
 */
export function extractSkillsFromSystemMessage(
  message: Record<string, unknown>,
): { skills: string[]; slashCommands: string[] } | null {
  const systemSkills = readStringArray(message.skills);
  const systemSlashCommands = readStringArray(message.slash_commands);

  if (systemSkills.length === 0 && systemSlashCommands.length === 0) {
    return null;
  }

  const mergedNames = uniqueStrings([...systemSlashCommands, ...systemSkills]);
  const skills = mergedNames.map(normalizeSlashCommandName).filter((name) => name.length > 0);

  if (skills.length === 0) {
    return null;
  }

  return { skills, slashCommands: mergedNames };
}
