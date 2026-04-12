import { Effect } from "effect";
import type { Effect as EffectType } from "effect";

import type { WorkspaceFileSystemError } from "../../workspace/Services/WorkspaceFileSystem.ts";
import type {
  WorkspacePathOutsideRootError,
  WorkspacePathsShape,
} from "../../workspace/Services/WorkspacePaths.ts";

const T3CODE_INTERNAL_DIRECTORY = ".t3code";
const T3CODE_INTERNAL_GITIGNORE_RELATIVE_PATH = `${T3CODE_INTERNAL_DIRECTORY}/.gitignore`;
const T3CODE_INTERNAL_GITIGNORE_CONTENTS = "*\n";

function isInsideT3codeInternalDirectory(relativePath: string): boolean {
  return (
    relativePath === T3CODE_INTERNAL_DIRECTORY ||
    relativePath.startsWith(`${T3CODE_INTERNAL_DIRECTORY}/`)
  );
}

export function ensureT3codeWorkspaceInternalArtifacts(input: {
  cwd: string;
  normalizedRelativePath: string;
  resolveRelativePathWithinRoot: WorkspacePathsShape["resolveRelativePathWithinRoot"];
  doesPathExist: (absolutePath: string) => EffectType.Effect<boolean, never>;
  makeDirectory: (
    absoluteDirectoryPath: string,
  ) => EffectType.Effect<void, WorkspaceFileSystemError>;
  writeFileString: (
    absolutePath: string,
    contents: string,
  ) => EffectType.Effect<void, WorkspaceFileSystemError>;
  dirname: (absolutePath: string) => string;
}): EffectType.Effect<void, WorkspaceFileSystemError | WorkspacePathOutsideRootError> {
  return Effect.gen(function* () {
    if (!isInsideT3codeInternalDirectory(input.normalizedRelativePath)) {
      return;
    }

    const gitIgnoreTarget = yield* input.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: T3CODE_INTERNAL_GITIGNORE_RELATIVE_PATH,
    });
    const gitIgnoreExists = yield* input.doesPathExist(gitIgnoreTarget.absolutePath);
    if (gitIgnoreExists) {
      return;
    }

    yield* input.makeDirectory(input.dirname(gitIgnoreTarget.absolutePath));
    yield* input.writeFileString(gitIgnoreTarget.absolutePath, T3CODE_INTERNAL_GITIGNORE_CONTENTS);
  });
}
