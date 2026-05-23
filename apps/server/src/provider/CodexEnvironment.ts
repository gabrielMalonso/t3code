// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expandHomePath } from "../pathExpansion.ts";

const COMPUTER_USE_APP_NAME = "Codex Computer Use.app";
const COMPUTER_USE_PLUGIN_CACHE_PATH = NodePath.join(
  "plugins",
  "cache",
  "openai-bundled",
  "computer-use",
);

export interface CodexProcessEnvironmentOptions {
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly homePath?: string | undefined;
}

export type CodexProcessEnvironment = Record<string, string>;

function pathExists(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0 && NodeFS.existsSync(value);
}

function semverishCompareDesc(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index]! : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index]! : 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return right.localeCompare(left);
}

function discoverBundledComputerUseApp(codexHomePath: string): string | undefined {
  const directCandidates = [
    NodePath.join(codexHomePath, "computer-use", COMPUTER_USE_APP_NAME),
    NodePath.join(codexHomePath, COMPUTER_USE_APP_NAME),
  ];

  for (const candidate of directCandidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }

  const pluginCachePath = NodePath.join(codexHomePath, COMPUTER_USE_PLUGIN_CACHE_PATH);
  if (!NodeFS.existsSync(pluginCachePath)) {
    return undefined;
  }

  let versions: string[];
  try {
    versions = NodeFS.readdirSync(pluginCachePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted(semverishCompareDesc);
  } catch {
    return undefined;
  }

  for (const version of versions) {
    const candidate = NodePath.join(pluginCachePath, version, COMPUTER_USE_APP_NAME);
    if (pathExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveCodexHomePath(input: {
  readonly env: CodexProcessEnvironment;
  readonly homePath?: string | undefined;
}): string {
  if (input.homePath && input.homePath.trim().length > 0) {
    return NodePath.resolve(expandHomePath(input.homePath));
  }

  const inheritedHome = input.env.CODEX_HOME;
  if (inheritedHome && inheritedHome.trim().length > 0) {
    return NodePath.resolve(expandHomePath(inheritedHome));
  }

  const inheritedUserHome = input.env.HOME;
  const userHome =
    inheritedUserHome && inheritedUserHome.trim().length > 0
      ? NodePath.resolve(expandHomePath(inheritedUserHome))
      : NodeOS.homedir();
  return NodePath.join(userHome, ".codex");
}

function resolveComputerUseServicePath(input: {
  readonly env: CodexProcessEnvironment;
  readonly codexHomePath: string;
}): string | undefined {
  const inheritedPath = input.env.SKY_CUA_SERVICE_PATH;
  if (pathExists(inheritedPath)) {
    return inheritedPath;
  }

  return discoverBundledComputerUseApp(input.codexHomePath);
}

function copyDefinedEnvironment(environment: NodeJS.ProcessEnv): CodexProcessEnvironment {
  const next: CodexProcessEnvironment = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined) {
      next[name] = value;
    }
  }
  return next;
}

export function buildCodexProcessEnvironment(
  options: CodexProcessEnvironmentOptions,
): CodexProcessEnvironment {
  const env = copyDefinedEnvironment(options.environment ?? process.env);
  const codexHomePath = resolveCodexHomePath({ env, homePath: options.homePath });

  if (
    (options.homePath && options.homePath.trim().length > 0) ||
    (env.CODEX_HOME && env.CODEX_HOME.trim().length > 0)
  ) {
    env.CODEX_HOME = codexHomePath;
  }

  const computerUseServicePath = resolveComputerUseServicePath({ env, codexHomePath });
  if (computerUseServicePath) {
    env.SKY_CUA_SERVICE_PATH = computerUseServicePath;
  }

  return env;
}
