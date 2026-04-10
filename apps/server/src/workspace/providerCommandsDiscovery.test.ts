import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";

import { listProviderCommands } from "./providerCommandsDiscovery";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("listProviderCommands", () => {
  it("discovers codex project skills and commands", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "t3-provider-commands-"));
    tempDirs.push(cwd);
    await mkdir(path.join(cwd, ".codex", "commands"), { recursive: true });
    await mkdir(path.join(cwd, ".codex", "skills", "review"), { recursive: true });
    await writeFile(path.join(cwd, ".codex", "commands", "ship-it.md"), "Ship it safely");
    await writeFile(
      path.join(cwd, ".codex", "skills", "review", "SKILL.md"),
      "---\ndescription: Review staged changes\n---\n",
    );

    const result = await Effect.runPromise(listProviderCommands({ provider: "codex", cwd }));

    expect(result.commands).toEqual([
      expect.objectContaining({
        name: "ship-it",
        source: "project",
      }),
    ]);
    expect(result.skills).toContainEqual(
      expect.objectContaining({
        name: "review",
        source: "project",
        path: path.join(cwd, ".codex", "skills", "review"),
      }),
    );
  });

  it("includes Claude built-in commands", async () => {
    const result = await Effect.runPromise(listProviderCommands({ provider: "claudeAgent" }));

    expect(result.commands.some((entry) => entry.name === "simplify")).toBe(true);
    expect(result.provider).toBe("claudeAgent");
  });

  it("discovers hidden Codex system skills under .system", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "t3-provider-commands-system-"));
    tempDirs.push(cwd);
    await mkdir(path.join(cwd, ".codex", "skills", ".system", "openai-docs"), {
      recursive: true,
    });
    await writeFile(
      path.join(cwd, ".codex", "skills", ".system", "openai-docs", "SKILL.md"),
      "---\ndescription: Use official OpenAI docs\n---\n",
    );

    const result = await Effect.runPromise(listProviderCommands({ provider: "codex", cwd }));

    expect(result.skills).toContainEqual(
      expect.objectContaining({
        name: "openai-docs",
        source: "project",
        path: path.join(cwd, ".codex", "skills", ".system", "openai-docs"),
      }),
    );
  });

  it("discovers Codex skills from ~/.agents/skills-compatible roots", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "t3-provider-commands-agents-"));
    tempDirs.push(cwd);
    await mkdir(path.join(cwd, ".agents", "skills", "planner"), {
      recursive: true,
    });
    await writeFile(
      path.join(cwd, ".agents", "skills", "planner", "SKILL.md"),
      "---\ndescription: Plan implementation work\n---\n",
    );

    const result = await Effect.runPromise(listProviderCommands({ provider: "codex", cwd }));

    expect(result.skills).toContainEqual(
      expect.objectContaining({
        name: "planner",
        source: "project",
        path: path.join(cwd, ".agents", "skills", "planner"),
      }),
    );
  });
});
