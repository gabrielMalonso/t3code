import { basenameOfPath } from "~/vscode-icons";

import type {
  ComposerFileReference,
  ComposerFileReferenceKind,
  ComposerFileReferenceScope,
  DisplayedFileReference,
} from "./types";

const TEXT_LIKE_EXTENSIONS = new Set([
  "txt",
  "md",
  "mdx",
  "csv",
  "json",
  "xml",
  "yml",
  "yaml",
  "log",
  "ini",
  "toml",
  "env",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "sh",
  "zsh",
  "bash",
  "css",
  "scss",
  "html",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
]);

function normalizePathValue(pathValue: string): string {
  return pathValue.replaceAll("\\", "/").replace(/\/+/g, "/").trim();
}

function extensionOfPath(pathValue: string): string {
  const base = basenameOfPath(pathValue).toLowerCase();
  const dotIndex = base.lastIndexOf(".");
  return dotIndex === -1 ? "" : base.slice(dotIndex + 1);
}

export function isSupportedFileReferenceCandidate(file: File): boolean {
  if (file.type === "application/pdf") {
    return true;
  }
  if (file.type.startsWith("text/")) {
    return true;
  }
  if (file.type === "application/json" || file.type === "application/xml") {
    return true;
  }
  return TEXT_LIKE_EXTENSIONS.has(extensionOfPath(file.name));
}

export function fileReferenceDedupKey(pathValue: string): string {
  return normalizePathValue(pathValue);
}

export function classifyFileReferenceScope(
  pathValue: string,
  workspaceRoot: string | null | undefined,
): ComposerFileReferenceScope {
  const normalizedPath = normalizePathValue(pathValue);
  const normalizedWorkspaceRoot = workspaceRoot ? normalizePathValue(workspaceRoot) : "";
  if (
    normalizedWorkspaceRoot.length > 0 &&
    (normalizedPath === normalizedWorkspaceRoot ||
      normalizedPath.startsWith(`${normalizedWorkspaceRoot}/`))
  ) {
    return "workspace";
  }
  return "external";
}

export function relativeFileReferencePath(
  pathValue: string,
  workspaceRoot: string | null | undefined,
): string {
  const normalizedPath = normalizePathValue(pathValue);
  const normalizedWorkspaceRoot = workspaceRoot ? normalizePathValue(workspaceRoot) : "";
  if (
    normalizedWorkspaceRoot.length > 0 &&
    normalizedPath.startsWith(`${normalizedWorkspaceRoot}/`)
  ) {
    return normalizedPath.slice(normalizedWorkspaceRoot.length + 1);
  }
  return normalizedPath;
}

export function classifyFileReferenceKind(input: {
  path: string;
  mimeType: string | null;
}): ComposerFileReferenceKind {
  if (input.mimeType === "application/pdf" || extensionOfPath(input.path) === "pdf") {
    return "pdf";
  }
  if (input.mimeType?.startsWith("text/")) {
    return "text";
  }
  const extension = extensionOfPath(input.path);
  if (TEXT_LIKE_EXTENSIONS.has(extension)) {
    return ["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "kt", "swift"].includes(
      extension,
    )
      ? "code"
      : "text";
  }
  if (input.mimeType === "application/json" || input.mimeType === "application/xml") {
    return "data";
  }
  return "other";
}

export function toDisplayedFileReference(
  reference: ComposerFileReference,
  workspaceRoot: string | null | undefined,
): DisplayedFileReference {
  const scope = classifyFileReferenceScope(reference.path, workspaceRoot);
  const path = relativeFileReferencePath(reference.path, workspaceRoot);
  return {
    path,
    scope,
    label: basenameOfPath(path),
    kind: classifyFileReferenceKind({
      path: reference.path,
      mimeType: reference.mimeType,
    }),
  };
}
