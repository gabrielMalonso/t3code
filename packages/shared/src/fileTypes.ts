/**
 * Shared whitelist of allowed text/code file types for file attachments.
 * Used by both server-side validation and client-side input filtering.
 */

export const SAFE_TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rb",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".sh",
  ".bash",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".sql",
  ".graphql",
  ".log",
  ".csv",
  ".diff",
  ".patch",
  ".env",
  ".gitignore",
  ".dockerfile",
  ".swift",
  ".kt",
  ".lua",
  ".r",
  ".m",
  ".mm",
  ".zig",
  ".v",
  ".nim",
  ".ex",
  ".exs",
  ".erl",
  ".hs",
  ".ml",
  ".proto",
  ".tf",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
]);

const ALLOWED_FILE_MIME_EXACT = new Set([
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/x-sh",
  "application/x-shellscript",
  "application/sql",
  "application/graphql",
]);

export function isAllowedFileMimeType(mimeType: string): boolean {
  const lower = mimeType.toLowerCase().trim();
  if (lower.startsWith("text/")) return true;
  return ALLOWED_FILE_MIME_EXACT.has(lower);
}

function resolveAllowedFileExtensionToken(fileName: string): string | null {
  const name = fileName.trim().toLowerCase();
  if (name.length === 0) {
    return null;
  }
  if (SAFE_TEXT_FILE_EXTENSIONS.has(name)) {
    return name;
  }
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex >= 0) {
    const ext = name.slice(dotIndex);
    if (SAFE_TEXT_FILE_EXTENSIONS.has(ext)) {
      return ext;
    }
  }
  const specialNameToken = `.${name}`;
  return SAFE_TEXT_FILE_EXTENSIONS.has(specialNameToken) ? specialNameToken : null;
}

export function isAllowedFileExtension(fileName: string): boolean {
  return resolveAllowedFileExtensionToken(fileName) !== null;
}

export function inferFileExtension(input: { mimeType: string; fileName?: string }): string {
  const fileName = input.fileName?.trim() ?? "";
  if (fileName.length > 0) {
    const ext = resolveAllowedFileExtensionToken(fileName);
    if (ext) return ext;
  }

  const mime = input.mimeType.toLowerCase();
  if (mime === "application/json") return ".json";
  if (mime === "application/javascript") return ".js";
  if (mime === "application/typescript") return ".ts";
  if (mime === "application/xml" || mime === "text/xml") return ".xml";
  if (mime === "application/yaml" || mime === "application/x-yaml") return ".yaml";
  if (mime === "application/toml") return ".toml";
  if (mime === "text/html") return ".html";
  if (mime === "text/css") return ".css";
  if (mime === "text/csv") return ".csv";
  if (mime === "text/markdown") return ".md";
  if (mime === "text/plain") return ".txt";

  return ".txt";
}
