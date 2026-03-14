import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverAvailableSkillsByProvider } from "./providerSkillsDiscovery";
import { resetDiscoveredSkillsCache, updateDiscoveredSkillsCache } from "./skillsCache";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, contents = ""): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

describe("discoverAvailableSkillsByProvider", () => {
  const originalHome = process.env.HOME;
  const originalCodexHome = process.env.CODEX_HOME;

  afterEach(() => {
    resetDiscoveredSkillsCache();
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
      return;
    }
    process.env.HOME = originalHome;
  });

  it("keeps provider skill catalogs isolated while preserving Claude caches", () => {
    const fakeHome = makeTempDir("t3code-home-");
    const projectCwd = makeTempDir("t3code-project-");
    process.env.HOME = fakeHome;

    writeFile(path.join(fakeHome, ".codex", "skills", "playwright-cli", "SKILL.md"), "# play");
    writeFile(path.join(fakeHome, ".claude", "commands", "review.md"), "# review");
    writeFile(path.join(fakeHome, ".claude", "skills", "triage", "SKILL.md"), "# triage");
    writeFile(path.join(projectCwd, ".claude", "commands", "ship.md"), "# ship");
    writeFile(path.join(projectCwd, ".claude", "skills", "audit", "SKILL.md"), "# audit");
    updateDiscoveredSkillsCache(projectCwd, "claudeCode", ["cached-claude-skill"]);
    updateDiscoveredSkillsCache(projectCwd, "codex", ["cached-codex-skill"]);

    expect(discoverAvailableSkillsByProvider(projectCwd)).toEqual({
      codex: [
        {
          name: "playwright-cli",
          path: path.join(fakeHome, ".codex", "skills", "playwright-cli", "SKILL.md"),
          sourceType: "user",
        },
      ],
      claudeCode: [
        {
          name: "review",
          path: path.join(fakeHome, ".claude", "commands", "review.md"),
          sourceType: "user",
        },
        {
          name: "triage",
          path: path.join(fakeHome, ".claude", "skills", "triage", "SKILL.md"),
          sourceType: "user",
        },
        {
          name: "ship",
          path: path.join(projectCwd, ".claude", "commands", "ship.md"),
          sourceType: "project",
        },
        {
          name: "audit",
          path: path.join(projectCwd, ".claude", "skills", "audit", "SKILL.md"),
          sourceType: "project",
        },
        { name: "cached-claude-skill" },
      ],
      cursor: [],
    });
  });

  it("discovers global Codex skills from CODEX_HOME and ignores project-local directories", () => {
    const fakeHome = makeTempDir("t3code-home-");
    const codexHome = makeTempDir("t3code-codex-home-");
    const projectCwd = makeTempDir("t3code-project-");
    const extraProjectCwd = makeTempDir("t3code-project-extra-");
    process.env.HOME = fakeHome;
    process.env.CODEX_HOME = codexHome;
    fs.mkdirSync(path.join(projectCwd, ".git"));
    fs.mkdirSync(path.join(extraProjectCwd, ".git"));

    writeFile(path.join(codexHome, "skills", "playwright-cli", "SKILL.md"), "# play");
    writeFile(path.join(codexHome, "skills", ".system", "skill-creator", "SKILL.md"), "# create");
    writeFile(path.join(projectCwd, ".codex", "skills", "build", "SKILL.md"), "# build");
    writeFile(path.join(extraProjectCwd, ".codex", "skills", "ship", "SKILL.md"), "# ship");

    expect(
      discoverAvailableSkillsByProvider(projectCwd, [extraProjectCwd]).codex.toSorted((a, b) =>
        a.name.localeCompare(b.name),
      ),
    ).toEqual([
      {
        name: "playwright-cli",
        path: path.join(codexHome, "skills", "playwright-cli", "SKILL.md"),
        sourceType: "user",
      },
      {
        name: "skill-creator",
        path: path.join(codexHome, "skills", ".system", "skill-creator", "SKILL.md"),
        sourceType: "user",
      },
    ]);
  });
});
