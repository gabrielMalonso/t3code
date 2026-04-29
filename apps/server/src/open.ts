/**
 * Open - Browser/editor launch service interface.
 *
 * Owns process launch helpers for opening URLs in a browser and workspace
 * paths in a configured editor.
 *
 * @module Open
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { EDITORS, OpenError, type EditorId } from "@t3tools/contracts";
import { isCommandAvailable, type CommandAvailabilityOptions } from "@t3tools/shared/shell";
import { Context, Effect, Layer } from "effect";

// ==============================
// Definitions
// ==============================

export { OpenError };
export { isCommandAvailable } from "@t3tools/shared/shell";

export interface OpenInEditorInput {
  readonly cwd: string;
  readonly editor: EditorId;
}

interface EditorLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

const TARGET_WITH_POSITION_PATTERN = /^(.*?):(\d+)(?::(\d+))?$/;

function parseTargetPathAndPosition(target: string): {
  path: string;
  line: string | undefined;
  column: string | undefined;
} | null {
  const match = TARGET_WITH_POSITION_PATTERN.exec(target);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    path: match[1],
    line: match[2],
    column: match[3],
  };
}

function resolveCommandEditorArgs(
  editor: (typeof EDITORS)[number],
  target: string,
): ReadonlyArray<string> {
  const parsedTarget = parseTargetPathAndPosition(target);

  switch (editor.launchStyle) {
    case "direct-path":
      return [target];
    case "goto":
      return parsedTarget ? ["--goto", target] : [target];
    case "line-column": {
      if (!parsedTarget) {
        return [target];
      }

      const { path, line, column } = parsedTarget;
      return [...(line ? ["--line", line] : []), ...(column ? ["--column", column] : []), path];
    }
  }
}

function resolveEditorArgs(
  editor: (typeof EDITORS)[number],
  target: string,
): ReadonlyArray<string> {
  const baseArgs = "baseArgs" in editor ? editor.baseArgs : [];
  return [...baseArgs, ...resolveCommandEditorArgs(editor, target)];
}

function resolveAvailableCommand(
  commands: ReadonlyArray<string>,
  options: CommandAvailabilityOptions = {},
): string | null {
  for (const command of commands) {
    if (isCommandAvailable(command, options)) {
      return command;
    }
  }
  return null;
}

function fileManagerCommandForPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "open";
    case "win32":
      return "explorer";
    default:
      return "xdg-open";
  }
}

function macApplicationExists(appName: string): boolean {
  return [
    path.join("/Applications", `${appName}.app`),
    path.join(os.homedir(), "Applications", `${appName}.app`),
  ].some((candidate) => existsSync(candidate));
}

function canUseMacApplicationFallback(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  return platform === "darwin" && env.PATH !== "";
}

function getMacAppName(editor: (typeof EDITORS)[number]): string | undefined {
  return "macAppName" in editor ? editor.macAppName : undefined;
}

export function resolveAvailableEditors(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<EditorId> {
  const available: EditorId[] = [];

  for (const editor of EDITORS) {
    if (editor.commands === null) {
      const command = fileManagerCommandForPlatform(platform);
      if (isCommandAvailable(command, { platform, env })) {
        available.push(editor.id);
      }
      continue;
    }

    const command = resolveAvailableCommand(editor.commands, { platform, env });
    const macAppName = getMacAppName(editor);
    if (
      command !== null ||
      (canUseMacApplicationFallback(platform, env) &&
        macAppName !== undefined &&
        macApplicationExists(macAppName))
    ) {
      available.push(editor.id);
    }
  }

  return available;
}

/**
 * OpenShape - Service API for browser and editor launch actions.
 */
export interface OpenShape {
  /**
   * Open a URL target in the default browser.
   */
  readonly openBrowser: (target: string) => Effect.Effect<void, OpenError>;

  /**
   * Open a workspace path in a selected editor integration.
   *
   * Launches the editor as a detached process so server startup is not blocked.
   */
  readonly openInEditor: (input: OpenInEditorInput) => Effect.Effect<void, OpenError>;
}

/**
 * Open - Service tag for browser/editor launch operations.
 */
export class Open extends Context.Service<Open, OpenShape>()("t3/open") {}

// ==============================
// Implementations
// ==============================

export const resolveEditorLaunch = Effect.fn("resolveEditorLaunch")(function* (
  input: OpenInEditorInput,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<EditorLaunch, OpenError> {
  yield* Effect.annotateCurrentSpan({
    "open.editor": input.editor,
    "open.cwd": input.cwd,
    "open.platform": platform,
  });
  const editorDef = EDITORS.find((editor) => editor.id === input.editor);
  if (!editorDef) {
    return yield* new OpenError({ message: `Unknown editor: ${input.editor}` });
  }

  if (editorDef.commands) {
    const command = resolveAvailableCommand(editorDef.commands, { platform, env });
    const macAppName = getMacAppName(editorDef);

    if (editorDef.id === "ghostty") {
      const workingDirectoryArg = `--working-directory=${input.cwd}`;
      if (command !== null) {
        return {
          command,
          args: [workingDirectoryArg],
        };
      }

      if (
        canUseMacApplicationFallback(platform, env) &&
        macAppName !== undefined &&
        macApplicationExists(macAppName)
      ) {
        return {
          command: "open",
          args: ["-na", macAppName, "--args", workingDirectoryArg],
        };
      }

      return {
        command: editorDef.commands[0],
        args: [workingDirectoryArg],
      };
    }

    if (
      command === null &&
      canUseMacApplicationFallback(platform, env) &&
      macAppName !== undefined &&
      macApplicationExists(macAppName)
    ) {
      return {
        command: "open",
        args: ["-a", macAppName, input.cwd],
      };
    }

    return {
      command: command ?? editorDef.commands[0],
      args: resolveEditorArgs(editorDef, input.cwd),
    };
  }

  if (editorDef.id !== "file-manager") {
    return yield* new OpenError({ message: `Unsupported editor: ${input.editor}` });
  }

  return { command: fileManagerCommandForPlatform(platform), args: [input.cwd] };
});

export const launchDetached = (launch: EditorLaunch) =>
  Effect.gen(function* () {
    if (!isCommandAvailable(launch.command)) {
      return yield* new OpenError({ message: `Editor command not found: ${launch.command}` });
    }

    yield* Effect.callback<void, OpenError>((resume) => {
      let child;
      try {
        const isWin32 = process.platform === "win32";
        child = spawn(
          launch.command,
          isWin32 ? launch.args.map((a) => `"${a}"`) : [...launch.args],
          {
            detached: true,
            stdio: "ignore",
            shell: isWin32,
          },
        );
      } catch (error) {
        return resume(
          Effect.fail(new OpenError({ message: "failed to spawn detached process", cause: error })),
        );
      }

      const handleSpawn = () => {
        child.unref();
        resume(Effect.void);
      };

      child.once("spawn", handleSpawn);
      child.once("error", (cause) =>
        resume(Effect.fail(new OpenError({ message: "failed to spawn detached process", cause }))),
      );
    });
  });

const make = Effect.gen(function* () {
  const open = yield* Effect.tryPromise({
    try: () => import("open"),
    catch: (cause) => new OpenError({ message: "failed to load browser opener", cause }),
  });

  return {
    openBrowser: (target) =>
      Effect.tryPromise({
        try: () => open.default(target),
        catch: (cause) => new OpenError({ message: "Browser auto-open failed", cause }),
      }),
    openInEditor: (input) => Effect.flatMap(resolveEditorLaunch(input), launchDetached),
  } satisfies OpenShape;
});

export const OpenLive = Layer.effect(Open, make);
