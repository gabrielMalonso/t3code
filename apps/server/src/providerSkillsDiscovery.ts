import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

import type {
  ServerAvailableSkillDescriptor,
  ServerAvailableSkillsByProvider,
} from "@t3tools/contracts";

import { getDiscoveredSkillCatalogCache } from "./skillsCache";

export const EMPTY_AVAILABLE_SKILLS_BY_PROVIDER: ServerAvailableSkillsByProvider = {
  codex: [],
  claudeCode: [],
  cursor: [],
};

function withAbsolutePath(pathValue: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(pathValue);
}

function uniqueSkillCatalog(
  skills: Iterable<ServerAvailableSkillDescriptor>,
): ServerAvailableSkillDescriptor[] {
  const seen = new Set<string>();
  const result: ServerAvailableSkillDescriptor[] = [];
  for (const skill of skills) {
    const key = `${skill.name}\u0000${skill.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}

/**
 * Read `.md` command files from a single commands directory.
 * Handles both flat files (name.md) and namespaced subdirs (namespace/name.md -> namespace:name).
 */
function readCommandDir(
  dir: string,
  sourceType: string,
  commands: ServerAvailableSkillDescriptor[],
): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && extname(entry.name) === ".md") {
        commands.push({
          name: basename(entry.name, ".md"),
          path: withAbsolutePath(join(dir, entry.name)),
          sourceType,
        });
      }
      if (entry.isDirectory()) {
        try {
          const subEntries = readdirSync(join(dir, entry.name), { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile() && extname(subEntry.name) === ".md") {
              commands.push({
                name: `${entry.name}:${basename(subEntry.name, ".md")}`,
                path: withAbsolutePath(join(dir, entry.name, subEntry.name)),
                sourceType,
              });
            }
          }
        } catch {
          // Ignore unreadable subdirectories.
        }
      }
    }
  } catch {
    // Ignore missing directories.
  }
}

function discoverSkillsFromDir(
  skillsDir: string,
  sourceType: string,
): ServerAvailableSkillDescriptor[] {
  const skills: ServerAvailableSkillDescriptor[] = [];
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const files = readdirSync(join(skillsDir, entry.name));
        const skillFile = files.find((file) => file.toUpperCase() === "SKILL.MD");
        if (!skillFile) continue;
        skills.push({
          name: entry.name,
          path: withAbsolutePath(join(skillsDir, entry.name, skillFile)),
          sourceType,
        });
      } catch {
        // Ignore unreadable skill directories.
      }
    }
  } catch {
    // Ignore missing directories.
  }
  return skills;
}

function discoverNestedCodexSkillsFromDir(
  skillsDir: string,
  sourceType: string,
): ServerAvailableSkillDescriptor[] {
  const skills: ServerAvailableSkillDescriptor[] = [];

  const visit = (dir: string): void => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      const skillEntry = entries.find(
        (entry) => entry.isFile() && entry.name.toUpperCase() === "SKILL.MD",
      );
      if (skillEntry) {
        skills.push({
          name: basename(dir),
          path: withAbsolutePath(join(dir, skillEntry.name)),
          sourceType,
        });
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        visit(join(dir, entry.name));
      }
    } catch {
      // Ignore missing or unreadable directories.
    }
  };

  visit(skillsDir);
  return skills;
}

function resolveCodexHomeDirectory(): string {
  return withAbsolutePath(process.env.CODEX_HOME || join(homedir(), ".codex"));
}

function readEnabledPlugins(): Array<{ pluginName: string; marketplace: string }> {
  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
    const plugins = raw?.plugins ?? {};
    const result: Array<{ pluginName: string; marketplace: string }> = [];
    for (const [key, enabled] of Object.entries(plugins)) {
      if (!enabled) continue;
      const atIndex = key.lastIndexOf("@");
      if (atIndex > 0) {
        result.push({
          pluginName: key.slice(0, atIndex),
          marketplace: key.slice(atIndex + 1),
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function discoverClaudePluginCommands(): ServerAvailableSkillDescriptor[] {
  const commands: ServerAvailableSkillDescriptor[] = [];
  const enabledPlugins = readEnabledPlugins();
  const cacheBase = join(homedir(), ".claude", "plugins", "cache");

  for (const { pluginName, marketplace } of enabledPlugins) {
    const pluginCacheDir = join(cacheBase, marketplace, pluginName);
    try {
      const versions = readdirSync(pluginCacheDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (versions.length === 0) continue;
      const latestVersion = versions.toSorted()[versions.length - 1]!;
      const versionDir = join(pluginCacheDir, latestVersion);

      readCommandDir(join(versionDir, "commands"), "plugin", commands);
      for (const skill of discoverSkillsFromDir(join(versionDir, "skills"), "plugin")) {
        commands.push({
          name: `${pluginName}:${skill.name}`,
          path: skill.path,
          ...(skill.description !== undefined ? { description: skill.description } : {}),
          ...(skill.suggestedUse !== undefined ? { suggestedUse: skill.suggestedUse } : {}),
          ...(skill.enabled !== undefined ? { enabled: skill.enabled } : {}),
          ...(skill.sourceType !== undefined ? { sourceType: skill.sourceType } : {}),
        });
      }

      try {
        const agentFiles = readdirSync(join(versionDir, "agents"), { withFileTypes: true });
        for (const agentFile of agentFiles) {
          if (agentFile.isFile() && extname(agentFile.name) === ".md") {
            commands.push({
              name: `${pluginName}:${basename(agentFile.name, ".md")}`,
              path: withAbsolutePath(join(versionDir, "agents", agentFile.name)),
              sourceType: "plugin",
            });
          }
        }
      } catch {
        // Ignore missing agents directories.
      }
    } catch {
      // Ignore uncached plugins.
    }
  }

  return commands;
}

function discoverClaudeCommandsFromFilesystem(
  projectCwd: string,
  extraProjectCwds?: readonly string[],
): ServerAvailableSkillDescriptor[] {
  const commands: ServerAvailableSkillDescriptor[] = [];

  readCommandDir(join(homedir(), ".claude", "commands"), "user", commands);
  commands.push(...discoverSkillsFromDir(join(homedir(), ".claude", "skills"), "user"));

  const allCwds = [projectCwd, ...(extraProjectCwds ?? [])];
  for (const cwd of allCwds) {
    readCommandDir(join(cwd, ".claude", "commands"), "project", commands);
    commands.push(...discoverSkillsFromDir(join(cwd, ".claude", "skills"), "project"));
  }

  commands.push(...discoverClaudePluginCommands());
  commands.push(...getDiscoveredSkillCatalogCache(projectCwd, "claudeCode"));

  return uniqueSkillCatalog(commands);
}

function discoverCodexSkillsFromFilesystem(
  _projectCwd: string,
  _extraProjectCwds?: readonly string[],
): ServerAvailableSkillDescriptor[] {
  return uniqueSkillCatalog(
    discoverNestedCodexSkillsFromDir(join(resolveCodexHomeDirectory(), "skills"), "user"),
  );
}

export function discoverAvailableSkillsByProvider(
  projectCwd: string,
  extraProjectCwds?: readonly string[],
): ServerAvailableSkillsByProvider {
  return {
    ...EMPTY_AVAILABLE_SKILLS_BY_PROVIDER,
    codex: discoverCodexSkillsFromFilesystem(projectCwd, extraProjectCwds),
    claudeCode: discoverClaudeCommandsFromFilesystem(projectCwd, extraProjectCwds),
  };
}
