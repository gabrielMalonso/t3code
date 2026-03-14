import Mime from "@effect/platform-node/Mime";

import {
  IMAGE_EXTENSION_BY_MIME_TYPE,
  SAFE_IMAGE_FILE_EXTENSIONS,
  DOCUMENT_EXTENSION_BY_MIME_TYPE,
  SAFE_DOCUMENT_FILE_EXTENSIONS,
  inferExtension,
} from "@t3tools/shared/fileMime";

export {
  IMAGE_EXTENSION_BY_MIME_TYPE,
  SAFE_IMAGE_FILE_EXTENSIONS,
  DOCUMENT_EXTENSION_BY_MIME_TYPE,
  SAFE_DOCUMENT_FILE_EXTENSIONS,
} from "@t3tools/shared/fileMime";

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

export function inferImageExtension(input: { mimeType: string; fileName?: string }): string {
  const fromMap = inferExtension(input, IMAGE_EXTENSION_BY_MIME_TYPE, SAFE_IMAGE_FILE_EXTENSIONS);
  if (fromMap !== ".bin") {
    return fromMap;
  }

  const fromMimeExtension = Mime.getExtension(input.mimeType);
  if (fromMimeExtension && SAFE_IMAGE_FILE_EXTENSIONS.has(fromMimeExtension)) {
    return fromMimeExtension;
  }

  return ".bin";
}

export function inferDocumentExtension(input: { mimeType: string; fileName?: string }): string {
  return inferExtension(input, DOCUMENT_EXTENSION_BY_MIME_TYPE, SAFE_DOCUMENT_FILE_EXTENSIONS);
}
