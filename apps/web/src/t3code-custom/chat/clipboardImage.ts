import { PROVIDER_SEND_TURN_MAX_IMAGE_BYTES } from "@t3tools/contracts";

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "image/webp": "webp",
};

type ClipboardReadResult = {
  readonly items?: ClipboardReadResultItem[];
  readonly value?: string;
  readonly type?: string;
};

type ClipboardReadResultItem = {
  readonly value?: string;
  readonly type?: string;
};

type ClipboardModule = {
  readonly Clipboard?: {
    readonly read?: () => Promise<ClipboardReadResult>;
  };
};

type CapacitorCoreModule = {
  readonly registerPlugin?: <Plugin>(pluginName: string) => Plugin;
};

type NativeClipboardImagePlugin = {
  readonly readImage?: () => Promise<ClipboardReadResult>;
};

function decodeBase64Bytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function imageFileName(mimeType: string): string {
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()] ?? "png";
  return `clipboard-image.${extension}`;
}

function estimateBase64ByteLength(base64: string): number | null {
  if (base64.length === 0 || base64.length % 4 === 1) return null;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function imageFileFromClipboardDataUrl(dataUrl: string): File | null {
  const match = /^data:([^,]+),([a-z0-9+/=\r\n ]+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  const headerParts = (match[1] ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const mimeType = headerParts[0]?.toLowerCase();
  const isBase64 = headerParts.some((part) => part.toLowerCase() === "base64");
  if (!mimeType?.startsWith("image/") || !isBase64) {
    return null;
  }

  const base64 = match[2]?.replace(/\s+/g, "");
  if (!base64) return null;
  const byteLength = estimateBase64ByteLength(base64);
  if (byteLength === null || byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return null;
  }

  try {
    const bytes = decodeBase64Bytes(base64);
    if (bytes.byteLength === 0) return null;
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new File([buffer], imageFileName(mimeType), { type: mimeType });
  } catch {
    return null;
  }
}

function imageFilesFromClipboardReadResult(result: ClipboardReadResult | null | undefined): File[] {
  const items =
    Array.isArray(result?.items) && result.items.length > 0 ? result.items : result ? [result] : [];
  const files: File[] = [];
  for (const item of items) {
    const value = item.value?.trim();
    if (!value) continue;
    const file = imageFileFromClipboardDataUrl(value);
    if (file) {
      files.push(file);
    }
  }
  return files;
}

export function imageFilesFromClipboardEventDetail(detail: unknown): File[] {
  if (!detail || typeof detail !== "object") {
    return [];
  }
  return imageFilesFromClipboardReadResult(detail as ClipboardReadResult);
}

async function readNativeClipboardImageFiles(): Promise<File[]> {
  try {
    const module = (await import("@capacitor/core")) as CapacitorCoreModule;
    const plugin = module.registerPlugin?.<NativeClipboardImagePlugin>("T3Clipboard");
    const result = await plugin?.readImage?.();
    return imageFilesFromClipboardReadResult(result);
  } catch {
    return [];
  }
}

export async function readCapacitorClipboardImageFiles(): Promise<File[]> {
  const nativeImageFiles = await readNativeClipboardImageFiles();
  if (nativeImageFiles.length > 0) {
    return nativeImageFiles;
  }

  const module = (await import("@capacitor/clipboard")) as ClipboardModule;
  const result = await module.Clipboard?.read?.();
  return imageFilesFromClipboardReadResult(result);
}

export async function readCapacitorClipboardImageFile(): Promise<File | null> {
  return (await readCapacitorClipboardImageFiles())[0] ?? null;
}
