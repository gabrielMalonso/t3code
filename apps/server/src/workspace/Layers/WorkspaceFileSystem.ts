import { Effect, FileSystem, Layer, Path } from "effect";

import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

const WORKSPACE_INTERNAL_DIRECTORY = ".t3code";
const WORKSPACE_INTERNAL_GITIGNORE_RELATIVE_PATH = `${WORKSPACE_INTERNAL_DIRECTORY}/.gitignore`;
const WORKSPACE_INTERNAL_GITIGNORE_CONTENTS = "*\n";

function isInsideWorkspaceInternalDirectory(relativePath: string): boolean {
  return (
    relativePath === WORKSPACE_INTERNAL_DIRECTORY ||
    relativePath.startsWith(`${WORKSPACE_INTERNAL_DIRECTORY}/`)
  );
}

export const makeWorkspaceFileSystem = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries;

  const toWorkspaceFileSystemError =
    (input: { cwd: string; relativePath: string }, operation: string) => (cause: Error) =>
      new WorkspaceFileSystemError({
        cwd: input.cwd,
        relativePath: input.relativePath,
        operation,
        detail: cause.message,
        cause,
      });

  const ensureWorkspaceInternalGitIgnore = Effect.fn(
    "WorkspaceFileSystem.ensureWorkspaceInternalGitIgnore",
  )(function* (input: { cwd: string; relativePath: string }) {
    if (!isInsideWorkspaceInternalDirectory(input.relativePath)) {
      return;
    }

    const gitIgnoreTarget = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: WORKSPACE_INTERNAL_GITIGNORE_RELATIVE_PATH,
    });
    const existingGitIgnore = yield* fileSystem
      .stat(gitIgnoreTarget.absolutePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (existingGitIgnore) {
      return;
    }

    yield* fileSystem
      .makeDirectory(path.dirname(gitIgnoreTarget.absolutePath), { recursive: true })
      .pipe(
        Effect.mapError(
          toWorkspaceFileSystemError(input, "workspaceFileSystem.makeDirectory.gitignore"),
        ),
      );
    yield* fileSystem
      .writeFileString(gitIgnoreTarget.absolutePath, WORKSPACE_INTERNAL_GITIGNORE_CONTENTS)
      .pipe(
        Effect.mapError(
          toWorkspaceFileSystemError(input, "workspaceFileSystem.writeFile.gitignore"),
        ),
      );
  });

  const writeFile: WorkspaceFileSystemShape["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    yield* ensureWorkspaceInternalGitIgnore(input);
    yield* fileSystem
      .makeDirectory(path.dirname(target.absolutePath), { recursive: true })
      .pipe(
        Effect.mapError(toWorkspaceFileSystemError(input, "workspaceFileSystem.makeDirectory")),
      );
    yield* fileSystem
      .writeFileString(target.absolutePath, input.contents)
      .pipe(Effect.mapError(toWorkspaceFileSystemError(input, "workspaceFileSystem.writeFile")));
    yield* workspaceEntries.invalidate(input.cwd);
    return { relativePath: target.relativePath };
  });
  return { writeFile } satisfies WorkspaceFileSystemShape;
});

export const WorkspaceFileSystemLive = Layer.effect(WorkspaceFileSystem, makeWorkspaceFileSystem);
