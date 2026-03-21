import Mime from "@effect/platform-node/Mime";

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

export function parseBase64DataUrl(
  dataUrl: string,
): { readonly mimeType: string; readonly base64: string } | null {
  const match = /^data:([^,]+),([a-z0-9+/=\r\n ]+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  const headerParts = (match[1] ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (headerParts.length < 2) {
    return null;
  }
  const trailingToken = headerParts.at(-1)?.toLowerCase();
  if (trailingToken !== "base64") {
    return null;
  }

  const mimeType = headerParts[0]?.toLowerCase();
  const base64 = match[2]?.replace(/\s+/g, "");
  if (!mimeType || !base64) return null;

  return { mimeType, base64 };
}

function extractFileNameExtension(
  fileName: string | undefined,
  safeSet: Set<string>,
): string | null {
  const trimmed = fileName?.trim() ?? "";
  const match = /\.([a-z0-9]{1,8})$/i.exec(trimmed);
  const ext = match ? `.${match[1]!.toLowerCase()}` : "";
  return safeSet.has(ext) ? ext : null;
}

export function inferImageExtension(input: { mimeType: string; fileName?: string }): string {
  const key = input.mimeType.toLowerCase();
  const fromMime = Object.hasOwn(IMAGE_EXTENSION_BY_MIME_TYPE, key)
    ? IMAGE_EXTENSION_BY_MIME_TYPE[key]
    : undefined;
  if (fromMime) {
    return fromMime;
  }

  const fromMimeExtension = Mime.getExtension(input.mimeType);
  if (fromMimeExtension && SAFE_IMAGE_FILE_EXTENSIONS.has(fromMimeExtension)) {
    return fromMimeExtension;
  }

  return extractFileNameExtension(input.fileName, SAFE_IMAGE_FILE_EXTENSIONS) ?? ".bin";
}

export const DOCUMENT_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
};

export const TEXT_FILE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
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

export function inferDocumentExtension(input: { mimeType: string; fileName?: string }): string {
  const key = input.mimeType.toLowerCase();

  const fromDocMime = Object.hasOwn(DOCUMENT_EXTENSION_BY_MIME_TYPE, key)
    ? DOCUMENT_EXTENSION_BY_MIME_TYPE[key]
    : undefined;
  if (fromDocMime) return fromDocMime;

  const fromTextMime = Object.hasOwn(TEXT_FILE_EXTENSION_BY_MIME_TYPE, key)
    ? TEXT_FILE_EXTENSION_BY_MIME_TYPE[key]
    : undefined;
  if (fromTextMime) return fromTextMime;

  return extractFileNameExtension(input.fileName, SAFE_DOCUMENT_FILE_EXTENSIONS) ?? ".bin";
}
