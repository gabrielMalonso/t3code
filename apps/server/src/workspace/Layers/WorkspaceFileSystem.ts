import { Effect, FileSystem, Layer, Path } from "effect";

import { ensureT3codeWorkspaceInternalArtifacts } from "../../t3code-custom/workspace/internalArtifacts.ts";
import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

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

  const writeFile: WorkspaceFileSystemShape["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    // t3code-custom workspace boundary: keep fork-specific internal artifacts
    // behind a helper so upstream syncs only touch this call site.
    yield* ensureT3codeWorkspaceInternalArtifacts({
      cwd: input.cwd,
      normalizedRelativePath: target.relativePath,
      resolveRelativePathWithinRoot: workspacePaths.resolveRelativePathWithinRoot,
      doesPathExist: (absolutePath) =>
        fileSystem.stat(absolutePath).pipe(
          Effect.map(() => true),
          Effect.catch(() => Effect.succeed(false)),
        ),
      makeDirectory: (absoluteDirectoryPath) =>
        fileSystem
          .makeDirectory(absoluteDirectoryPath, { recursive: true })
          .pipe(
            Effect.mapError(
              toWorkspaceFileSystemError(input, "workspaceFileSystem.makeDirectory.gitignore"),
            ),
          ),
      writeFileString: (absolutePath, contents) =>
        fileSystem
          .writeFileString(absolutePath, contents)
          .pipe(
            Effect.mapError(
              toWorkspaceFileSystemError(input, "workspaceFileSystem.writeFile.gitignore"),
            ),
          ),
      dirname: path.dirname,
    });
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
