// @effect-diagnostics nodeBuiltinImport:off
import fsPromises from "node:fs/promises";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ensureT3codeWorkspaceInternalArtifacts } from "../../t3code-custom/workspace/internalArtifacts.ts";
import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import * as WorkspaceEntries from "../WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

const PROJECT_READ_FILE_MAX_BYTES = 1024 * 1024;

export const makeWorkspaceFileSystem = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;

  const readFile: WorkspaceFileSystemShape["readFile"] = Effect.fn("WorkspaceFileSystem.readFile")(
    function* (input) {
      const target = yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
      });

      const result = yield* Effect.tryPromise({
        try: async () => {
          const [realWorkspaceRoot, realTargetPath] = await Promise.all([
            fsPromises.realpath(input.cwd),
            fsPromises.realpath(target.absolutePath),
          ]);
          const relativeRealPath = path.relative(realWorkspaceRoot, realTargetPath);
          if (
            relativeRealPath.startsWith(`..${path.sep}`) ||
            relativeRealPath === ".." ||
            path.isAbsolute(relativeRealPath)
          ) {
            throw new Error("Workspace file path resolves outside the project root.");
          }

          const handle = await fsPromises.open(realTargetPath, "r");
          try {
            const stat = await handle.stat();
            if (!stat.isFile()) {
              throw new Error("Workspace path is not a file.");
            }
            const bytesToRead = Math.min(stat.size, PROJECT_READ_FILE_MAX_BYTES);
            const buffer = Buffer.alloc(bytesToRead);
            const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
            const fileBytes = buffer.subarray(0, bytesRead);
            if (fileBytes.includes(0)) {
              throw new Error("Binary files cannot be previewed as text.");
            }
            const contents = new TextDecoder("utf-8").decode(fileBytes);
            return {
              relativePath: target.relativePath,
              contents,
              byteLength: stat.size,
              truncated: stat.size > PROJECT_READ_FILE_MAX_BYTES,
            };
          } finally {
            await handle.close();
          }
        },
        catch: (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.readFile",
            detail: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      });

      return result;
    },
  );

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
    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });
  return { readFile, writeFile } satisfies WorkspaceFileSystemShape;
});

export const WorkspaceFileSystemLive = Layer.effect(WorkspaceFileSystem, makeWorkspaceFileSystem);
