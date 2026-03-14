export const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/tiff": ".tiff",
  "image/webp": ".webp",
};

export const SAFE_IMAGE_FILE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tiff",
  ".webp",
]);

export const DOCUMENT_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/json": ".json",
  "text/xml": ".xml",
  "application/xml": ".xml",
  "text/x-log": ".log",
};

export const SAFE_DOCUMENT_FILE_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".log",
  ".md",
  ".pdf",
  ".txt",
  ".xml",
]);

export const SUPPORTED_DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);

export const SUPPORTED_TEXT_FILE_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/xml",
  "application/xml",
  "text/x-log",
]);

export const SUPPORTED_TEXT_FILE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".log",
  ".xml",
]);

export function inferExtension(
  input: { mimeType: string; fileName?: string },
  extensionByMimeType: Record<string, string>,
  safeExtensions: Set<string>,
): string {
  const key = input.mimeType.toLowerCase();
  const fromMime = Object.hasOwn(extensionByMimeType, key) ? extensionByMimeType[key] : undefined;
  if (fromMime) {
    return fromMime;
  }

  const fileName = input.fileName?.trim() ?? "";
  const extensionMatch = /\.([a-z0-9]{1,8})$/i.exec(fileName);
  const fileNameExtension = extensionMatch ? `.${extensionMatch[1]!.toLowerCase()}` : "";
  if (safeExtensions.has(fileNameExtension)) {
    return fileNameExtension;
  }

  return ".bin";
}
