import type { DisplayedFileReference } from "./types";

export const FILE_REFERENCES_OPEN_TAG = "<t3code-file-references>";
export const FILE_REFERENCES_CLOSE_TAG = "</t3code-file-references>";
const FILE_REFERENCES_BLOCK_PATTERN = new RegExp(
  `(?:\\n{2,})?${FILE_REFERENCES_OPEN_TAG}\\n([\\s\\S]*?)\\n${FILE_REFERENCES_CLOSE_TAG}\\s*$`,
);

function escapeFileReferencePath(pathValue: string): string {
  return pathValue.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
}

function unescapeFileReferencePath(pathValue: string): string {
  return pathValue.replaceAll("\\n", "\n").replaceAll("\\\\", "\\");
}

export function buildFileReferencesBlock(
  references: ReadonlyArray<DisplayedFileReference>,
): string {
  if (references.length === 0) {
    return "";
  }
  return [
    FILE_REFERENCES_OPEN_TAG,
    "Referenced files:",
    ...references.map(
      (reference) => `- ${reference.scope}: ${escapeFileReferencePath(reference.path)}`,
    ),
    FILE_REFERENCES_CLOSE_TAG,
  ].join("\n");
}

export function appendFileReferencesToPrompt(
  prompt: string,
  references: ReadonlyArray<DisplayedFileReference>,
): string {
  const trimmedPrompt = prompt.trim();
  const block = buildFileReferencesBlock(references);
  if (block.length === 0) {
    return trimmedPrompt;
  }
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${block}` : block;
}

export function extractTrailingFileReferences(prompt: string): {
  promptText: string;
  fileReferences: DisplayedFileReference[];
  copyText: string;
} {
  const match = FILE_REFERENCES_BLOCK_PATTERN.exec(prompt);
  if (!match) {
    return {
      promptText: prompt,
      fileReferences: [],
      copyText: prompt,
    };
  }

  const promptText = prompt.slice(0, match.index).replace(/\n+$/, "");
  const fileReferences: DisplayedFileReference[] = [];
  for (const rawLine of (match[1] ?? "").split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) {
      continue;
    }
    const separatorIndex = line.indexOf(": ", 2);
    if (separatorIndex === -1) {
      continue;
    }
    const scopeValue = line.slice(2, separatorIndex);
    const encodedPath = line.slice(separatorIndex + 2);
    if ((scopeValue !== "workspace" && scopeValue !== "external") || encodedPath.length === 0) {
      continue;
    }
    const path = unescapeFileReferencePath(encodedPath);
    const slashIndex = path.lastIndexOf("/");
    fileReferences.push({
      path,
      scope: scopeValue,
      label: slashIndex === -1 ? path : path.slice(slashIndex + 1),
      kind: path.toLowerCase().endsWith(".pdf") ? "pdf" : "other",
    });
  }

  const replacement =
    fileReferences.length === 0
      ? ""
      : `\n\nReferenced files:\n${fileReferences
          .map((reference) => `- ${reference.scope}: ${reference.path}`)
          .join("\n")}`;

  return {
    promptText,
    fileReferences,
    copyText: prompt.replace(FILE_REFERENCES_BLOCK_PATTERN, replacement).trimEnd(),
  };
}
