import * as FS from "node:fs";
import * as Path from "node:path";

export function resolveDesktopResourcePath(input: {
  readonly fileName: string;
  readonly dirname: string;
  readonly resourcesPath: string;
}): string | null {
  const candidates = [
    Path.join(input.dirname, "../resources", input.fileName),
    Path.join(input.dirname, "../prod-resources", input.fileName),
    Path.join(input.resourcesPath, "resources", input.fileName),
    Path.join(input.resourcesPath, input.fileName),
  ];

  for (const candidate of candidates) {
    if (FS.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
