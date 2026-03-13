import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

import type { ServerAvailableSkillsByProvider } from "@t3tools/contracts";

import { getDiscoveredSkillsCache } from "./skillsCache";

export const EMPTY_AVAILABLE_SKILLS_BY_PROVIDER: ServerAvailableSkillsByProvider = {
  codex: [],
  claudeCode: [],
  cursor: [],
};

/**
 * Read `.md` command files from a single commands directory.
 * Handles both flat files (name.md) and namespaced subdirs (namespace/name.md -> namespace:name).
 */
function readCommandDir(dir: string, commands: string[]): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && extname(entry.name) === ".md") {
        commands.push(basename(entry.name, ".md"));
      }
      if (entry.isDirectory()) {
        try {
          const subEntries = readdirSync(join(dir, entry.name), { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile() && extname(subEntry.name) === ".md") {
              commands.push(`${entry.name}:${basename(subEntry.name, ".md")}`);
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

function discoverSkillsFromDir(skillsDir: string): string[] {
  const skills: string[] = [];
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const files = readdirSync(join(skillsDir, entry.name));
        if (files.some((file) => file.toUpperCase() === "SKILL.MD")) {
          skills.push(entry.name);
        }
      } catch {
        // Ignore unreadable skill directories.
      }
    }
  } catch {
    // Ignore missing directories.
  }
  return skills;
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

function discoverClaudePluginCommands(): string[] {
  const commands: string[] = [];
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

      readCommandDir(join(versionDir, "commands"), commands);

      try {
        const skillDirs = readdirSync(join(versionDir, "skills"), { withFileTypes: true });
        for (const skillDir of skillDirs) {
          if (skillDir.isDirectory()) {
            commands.push(`${pluginName}:${skillDir.name}`);
          }
        }
      } catch {
        // Ignore missing skills directories.
      }

      try {
        const agentFiles = readdirSync(join(versionDir, "agents"), { withFileTypes: true });
        for (const agentFile of agentFiles) {
          if (agentFile.isFile() && extname(agentFile.name) === ".md") {
            commands.push(`${pluginName}:${basename(agentFile.name, ".md")}`);
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

export function discoverClaudeCommandsFromFilesystem(
  projectCwd: string,
  extraProjectCwds?: readonly string[],
): string[] {
  const commands: string[] = [];

  readCommandDir(join(homedir(), ".claude", "commands"), commands);
  commands.push(...discoverSkillsFromDir(join(homedir(), ".claude", "skills")));

  const allCwds = [projectCwd, ...(extraProjectCwds ?? [])];
  for (const cwd of allCwds) {
    readCommandDir(join(cwd, ".claude", "commands"), commands);
    commands.push(...discoverSkillsFromDir(join(cwd, ".claude", "skills")));
  }

  commands.push(...discoverClaudePluginCommands());

  const cached = getDiscoveredSkillsCache(projectCwd, "claudeCode");
  return [...new Set([...commands, ...cached])];
}

export function discoverAvailableSkillsByProvider(
  projectCwd: string,
  extraProjectCwds?: readonly string[],
): ServerAvailableSkillsByProvider {
  return {
    ...EMPTY_AVAILABLE_SKILLS_BY_PROVIDER,
    claudeCode: discoverClaudeCommandsFromFilesystem(projectCwd, extraProjectCwds),
  };
}
