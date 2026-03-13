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

  afterEach(() => {
    resetDiscoveredSkillsCache();
    if (originalHome === undefined) {
      delete process.env.HOME;
      return;
    }
    process.env.HOME = originalHome;
  });

  it("keeps Claude filesystem skills isolated from Codex and Cursor", () => {
    const fakeHome = makeTempDir("t3code-home-");
    const projectCwd = makeTempDir("t3code-project-");
    process.env.HOME = fakeHome;

    writeFile(path.join(fakeHome, ".claude", "commands", "review.md"), "# review");
    writeFile(path.join(fakeHome, ".claude", "skills", "triage", "SKILL.md"), "# triage");
    writeFile(path.join(projectCwd, ".claude", "commands", "ship.md"), "# ship");
    writeFile(path.join(projectCwd, ".claude", "skills", "audit", "SKILL.md"), "# audit");
    updateDiscoveredSkillsCache(projectCwd, "claudeCode", ["cached-claude-skill"]);
    updateDiscoveredSkillsCache(projectCwd, "codex", ["cached-codex-skill"]);

    expect(discoverAvailableSkillsByProvider(projectCwd)).toEqual({
      codex: [],
      claudeCode: ["review", "triage", "ship", "audit", "cached-claude-skill"],
      cursor: [],
    });
  });
});
