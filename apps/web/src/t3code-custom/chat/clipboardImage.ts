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

async function readNativeClipboardImageFile(): Promise<File | null> {
  try {
    const module = (await import("@capacitor/core")) as CapacitorCoreModule;
    const plugin = module.registerPlugin?.<NativeClipboardImagePlugin>("T3Clipboard");
    const result = await plugin?.readImage?.();
    const value = result?.value?.trim();
    if (!value) return null;
    return imageFileFromClipboardDataUrl(value);
  } catch {
    return null;
  }
}

export async function readCapacitorClipboardImageFile(): Promise<File | null> {
  const nativeImageFile = await readNativeClipboardImageFile();
  if (nativeImageFile) {
    return nativeImageFile;
  }

  const module = (await import("@capacitor/clipboard")) as ClipboardModule;
  const result = await module.Clipboard?.read?.();
  const value = result?.value?.trim();
  if (!value) return null;
  return imageFileFromClipboardDataUrl(value);
}
