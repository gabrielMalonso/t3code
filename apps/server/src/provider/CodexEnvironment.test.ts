// @effect-diagnostics nodeBuiltinImport:off
import assert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, it } from "vitest";

import { buildCodexProcessEnvironment } from "./CodexEnvironment.ts";

function makeTempDir(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-codex-env-"));
}

function makeComputerUseApp(codexHome: string, version: string): string {
  const appPath = NodePath.join(
    codexHome,
    "plugins",
    "cache",
    "openai-bundled",
    "computer-use",
    version,
    "Codex Computer Use.app",
  );
  NodeFS.mkdirSync(appPath, { recursive: true });
  return appPath;
}

describe("buildCodexProcessEnvironment", () => {
  it("expands CODEX_HOME and points SKY_CUA_SERVICE_PATH at the newest bundled Computer Use app", () => {
    const codexHome = makeTempDir();
    const olderApp = makeComputerUseApp(codexHome, "1.0.7");
    const newerApp = makeComputerUseApp(codexHome, "1.0.12");

    try {
      const env = buildCodexProcessEnvironment({
        environment: {
          HOME: NodeOS.homedir(),
          SKY_CUA_SERVICE_PATH: NodePath.join(codexHome, "missing.app"),
        },
        homePath: codexHome,
      });

      assert.equal(env.CODEX_HOME, codexHome);
      assert.equal(env.SKY_CUA_SERVICE_PATH, newerApp);
      assert.notEqual(env.SKY_CUA_SERVICE_PATH, olderApp);
    } finally {
      NodeFS.rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("keeps a valid inherited Computer Use service path", () => {
    const codexHome = makeTempDir();
    const inheritedApp = NodePath.join(codexHome, "inherited", "Codex Computer Use.app");
    NodeFS.mkdirSync(inheritedApp, { recursive: true });
    makeComputerUseApp(codexHome, "1.0.12");

    try {
      const env = buildCodexProcessEnvironment({
        environment: {
          HOME: NodeOS.homedir(),
          SKY_CUA_SERVICE_PATH: inheritedApp,
        },
        homePath: codexHome,
      });

      assert.equal(env.SKY_CUA_SERVICE_PATH, inheritedApp);
    } finally {
      NodeFS.rmSync(codexHome, { recursive: true, force: true });
    }
  });
});
