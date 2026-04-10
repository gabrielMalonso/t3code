import { randomUUID } from "~/lib/utils";
import { readLocalApi } from "~/localApi";

import { fileReferenceCopy } from "./i18n";
import { fileReferenceDedupKey, isSupportedFileReferenceCandidate } from "./paths";
import type { ComposerFileReference } from "./types";

export async function resolveComposerFileReferencesFromFiles(files: ReadonlyArray<File>): Promise<{
  references: ComposerFileReference[];
  errors: string[];
}> {
  if (typeof window !== "undefined" && !window.desktopBridge) {
    return {
      references: [],
      errors: [fileReferenceCopy.error.unavailableOnWeb],
    };
  }

  const api = readLocalApi();
  if (!api) {
    return {
      references: [],
      errors: [fileReferenceCopy.error.unavailableOnWeb],
    };
  }

  const references: ComposerFileReference[] = [];
  const errors: string[] = [];
  const dedupKeys = new Set<string>();

  for (const file of files) {
    if (!isSupportedFileReferenceCandidate(file)) {
      errors.push(fileReferenceCopy.error.unsupportedType(file.name));
      continue;
    }

    const path = await api.dialogs.getPathForFile(file);
    if (!path) {
      errors.push(fileReferenceCopy.error.unresolvedPath(file.name));
      continue;
    }

    const dedupKey = fileReferenceDedupKey(path);
    if (dedupKeys.has(dedupKey)) {
      continue;
    }
    dedupKeys.add(dedupKey);

    references.push({
      id: randomUUID(),
      name: file.name || "file",
      path,
      mimeType: file.type.length > 0 ? file.type : null,
      sizeBytes: file.size,
    });
  }

  return {
    references,
    errors,
  };
}
