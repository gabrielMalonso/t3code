import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  type ProviderCommandEntry,
  type ProviderCommandsListInput,
  type ProviderCommandsListResult,
  type ProviderCommandSource,
  type ProviderKind,
  ProviderCommandsListError,
} from "@t3tools/contracts";
import { Effect } from "effect";

interface ProviderLayout {
  readonly directoryNames: ReadonlyArray<string>;
  readonly commandSubpaths: ReadonlyArray<string>;
  readonly skillSubpaths: ReadonlyArray<string>;
  readonly builtinCommands?: ReadonlyArray<ProviderCommandEntry>;
  readonly allowedHiddenSkillDirectories?: ReadonlySet<string>;
  readonly extraUserSkillRoots?: ReadonlyArray<string>;
  readonly extraProjectSkillRoots?: ReadonlyArray<string>;
}

const CLAUDE_BUILTIN_COMMANDS: ReadonlyArray<ProviderCommandEntry> = [
  {
    name: "batch",
    source: "builtin",
    description: "Plan and execute a larger change in parallel.",
  },
  { name: "claude-api", source: "builtin", description: "Help with Claude API or SDK work." },
  {
    name: "claude-in-chrome",
    source: "builtin",
    description: "Automate Chrome to inspect and interact with pages.",
  },
  {
    name: "debug",
    source: "builtin",
    description: "Enable debug logging for the current session.",
  },
  { name: "loop", source: "builtin", description: "Run a prompt or slash command on an interval." },
  { name: "schedule", source: "builtin", description: "Create or run scheduled remote agents." },
  { name: "simplify", source: "builtin", description: "Review changed code and clean it up." },
] as const;

const PROVIDER_LAYOUTS: Record<ProviderKind, ProviderLayout> = {
  codex: {
    directoryNames: [".codex"],
    commandSubpaths: ["commands", "prompts"],
    skillSubpaths: ["skills"],
    allowedHiddenSkillDirectories: new Set([".system"]),
    extraUserSkillRoots: [".agents/skills", ".agent/skills"],
    extraProjectSkillRoots: [".agents/skills", ".agent/skills"],
  },
  claudeAgent: {
    directoryNames: [".claude"],
    commandSubpaths: ["commands"],
    skillSubpaths: ["skills"],
    builtinCommands: CLAUDE_BUILTIN_COMMANDS,
  },
};

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*/;
const DESCRIPTION_PATTERN = /^description\s*:\s*(.+)$/im;

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function normalizeDescription(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed.length <= 160 ? trimmed : `${trimmed.slice(0, 157)}...`;
}

function extractDescription(content: string): string | undefined {
  const frontmatter = FRONTMATTER_PATTERN.exec(content);
  if (frontmatter?.[1]) {
    const match = DESCRIPTION_PATTERN.exec(frontmatter[1]);
    if (match?.[1]) {
      return normalizeDescription(match[1]);
    }
  }
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return normalizeDescription(trimmed);
  }
  return undefined;
}

async function readDirEntries(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function collectCommandsFromDir(
  dir: string,
  source: ProviderCommandSource,
  prefix = "",
): Promise<ProviderCommandEntry[]> {
  const entries = await readDirEntries(dir);
  const discovered: ProviderCommandEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      discovered.push(...(await collectCommandsFromDir(entryPath, source, nextPrefix)));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const baseName = stripExtension(entry.name);
    if (!baseName) {
      continue;
    }
    const commandName = prefix ? `${prefix}/${baseName}` : baseName;
    const content = (await readTextFile(entryPath)) ?? "";
    discovered.push({
      name: commandName,
      source,
      path: entryPath,
      ...(extractDescription(content) ? { description: extractDescription(content) } : {}),
    });
  }
  return discovered;
}

async function collectSkillsFromDir(
  dir: string,
  source: ProviderCommandSource,
  options?: {
    readonly allowedHiddenDirectories?: ReadonlySet<string>;
  },
): Promise<ProviderCommandEntry[]> {
  const entries = await readDirEntries(dir);
  const discovered: ProviderCommandEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const isHiddenDirectory = entry.name.startsWith(".");
    if (isHiddenDirectory && !options?.allowedHiddenDirectories?.has(entry.name)) {
      continue;
    }
    const skillDir = path.join(dir, entry.name);
    const skillFile =
      (await readTextFile(path.join(skillDir, "SKILL.md"))) ??
      (await readTextFile(path.join(skillDir, "skill.md")));
    if (skillFile !== null) {
      discovered.push({
        name: entry.name,
        source,
        path: skillDir,
        ...(extractDescription(skillFile) ? { description: extractDescription(skillFile) } : {}),
      });
    }
    discovered.push(
      ...(await collectSkillsFromDir(
        skillDir,
        source,
        options?.allowedHiddenDirectories
          ? { allowedHiddenDirectories: options.allowedHiddenDirectories }
          : undefined,
      )),
    );
  }
  return discovered;
}

function dedupeByName(
  entries: ReadonlyArray<ProviderCommandEntry>,
): ReadonlyArray<ProviderCommandEntry> {
  const sourceRank: Record<ProviderCommandSource, number> = {
    project: 0,
    user: 1,
    builtin: 2,
  };
  const byName = new Map<string, ProviderCommandEntry>();
  for (const entry of entries) {
    const existing = byName.get(entry.name);
    if (!existing || sourceRank[entry.source] < sourceRank[existing.source]) {
      byName.set(entry.name, entry);
    }
  }
  return [...byName.values()].toSorted((left, right) => left.name.localeCompare(right.name));
}

async function discoverInternal(
  input: ProviderCommandsListInput,
): Promise<ProviderCommandsListResult> {
  const layout = PROVIDER_LAYOUTS[input.provider];
  const home = homedir();
  const roots: Array<{ root: string; source: ProviderCommandSource }> = layout.directoryNames.map(
    (directoryName) => ({
      root: path.join(home, directoryName),
      source: "user" as const,
    }),
  );
  if (input.cwd) {
    roots.push(
      ...layout.directoryNames.map((directoryName) => ({
        root: path.join(input.cwd!, directoryName),
        source: "project" as const,
      })),
    );
  }

  const discoveredCommands = [...(layout.builtinCommands ?? [])];
  const discoveredSkills: ProviderCommandEntry[] = [];

  await Promise.all(
    roots.map(async ({ root, source }) => {
      const [commands, skills] = await Promise.all([
        Promise.all(
          layout.commandSubpaths.map((subpath) =>
            collectCommandsFromDir(path.join(root, subpath), source),
          ),
        ),
        Promise.all(
          layout.skillSubpaths.map((subpath) =>
            collectSkillsFromDir(
              path.join(root, subpath),
              source,
              layout.allowedHiddenSkillDirectories
                ? { allowedHiddenDirectories: layout.allowedHiddenSkillDirectories }
                : undefined,
            ),
          ),
        ),
      ]);
      discoveredCommands.push(...commands.flat());
      discoveredSkills.push(...skills.flat());
    }),
  );

  const extraSkillRoots: Array<{ root: string; source: ProviderCommandSource }> = [
    ...(layout.extraUserSkillRoots ?? []).map((relativeRoot) => ({
      root: path.join(home, relativeRoot),
      source: "user" as const,
    })),
    ...((input.cwd ? (layout.extraProjectSkillRoots ?? []) : []).map((relativeRoot) => ({
      root: path.join(input.cwd!, relativeRoot),
      source: "project" as const,
    })) ?? []),
  ];

  await Promise.all(
    extraSkillRoots.map(async ({ root, source }) => {
      discoveredSkills.push(
        ...(await collectSkillsFromDir(
          root,
          source,
          layout.allowedHiddenSkillDirectories
            ? { allowedHiddenDirectories: layout.allowedHiddenSkillDirectories }
            : undefined,
        )),
      );
    }),
  );

  return {
    provider: input.provider,
    commands: [...dedupeByName(discoveredCommands)],
    skills: [...dedupeByName(discoveredSkills)],
  };
}

export function listProviderCommands(input: ProviderCommandsListInput) {
  return Effect.tryPromise({
    try: () => discoverInternal(input),
    catch: (cause) =>
      new ProviderCommandsListError({
        message:
          cause instanceof Error
            ? cause.message
            : "Failed to discover provider commands and skills.",
        cause,
      }),
  });
}
