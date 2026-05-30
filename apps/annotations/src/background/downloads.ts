import type { CaptureRequest, SavedImage } from "../shared/types";
import { redactSensitiveText } from "../shared/privacy";

type ChromeEvent<T> = {
  addListener(listener: (event: T) => void): void;
  removeListener(listener: (event: T) => void): void;
};

export type DownloadsApi = {
  download(options: chrome.downloads.DownloadOptions): Promise<number>;
  search(query: chrome.downloads.DownloadQuery): Promise<chrome.downloads.DownloadItem[]>;
  onChanged: ChromeEvent<chrome.downloads.DownloadDelta>;
  onErased: ChromeEvent<number>;
};

export type DownloadRenderedPngInput = {
  imageDataUrl: string;
  requestedFilename: string;
  imageBytes: number;
  width: number;
  height: number;
};

export const DOWNLOAD_FOLDER = "Annotations-PNG";
export const DOWNLOAD_FOLDER_STORAGE_KEY = "annotationsDownloadFolder";
export const DOWNLOAD_TIMEOUT_MS = 15_000;
export const MAX_DOWNLOAD_DATA_URL_BYTES = 32 * 1024 * 1024;

export async function downloadRenderedPng(
  input: DownloadRenderedPngInput,
  api: DownloadsApi = chrome.downloads,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<SavedImage> {
  if (input.imageDataUrl.length > MAX_DOWNLOAD_DATA_URL_BYTES) {
    throw new Error(
      `download-failed: rendered PNG data URL is too large (${input.imageDataUrl.length} bytes)`,
    );
  }

  const downloadId = await api.download({
    url: input.imageDataUrl,
    filename: input.requestedFilename,
    conflictAction: "uniquify",
    saveAs: false,
  });

  await waitForDownloadComplete(api, downloadId, timeoutMs);
  const item = await getDownloadItem(api, downloadId);

  return {
    downloadId,
    filename: item.filename,
    requestedFilename: input.requestedFilename,
    imageBytes: input.imageBytes,
    width: input.width,
    height: input.height,
  };
}

export function buildDownloadFilename(
  request: CaptureRequest,
  options: { now?: Date; folder?: string } = {},
): string {
  const now = options.now ?? new Date(request.createdAt);
  const folder = sanitizeDownloadFolder(options.folder ?? DOWNLOAD_FOLDER);
  const timestamp = formatDownloadTimestamp(Number.isNaN(now.getTime()) ? new Date() : now);
  const selectorSlug = slugifySelector(redactSensitiveText(request.element.shortSelector));
  const id = shortId(request.id);
  return `${folder}/${timestamp}-${selectorSlug}-${id}.png`;
}

export async function getConfiguredDownloadFolder(
  storage: Pick<chrome.storage.StorageArea, "get"> | undefined = globalThis.chrome?.storage?.local,
): Promise<string> {
  if (!storage) return DOWNLOAD_FOLDER;

  try {
    const result = await storage.get(DOWNLOAD_FOLDER_STORAGE_KEY);
    const value = result[DOWNLOAD_FOLDER_STORAGE_KEY];
    return sanitizeDownloadFolder(typeof value === "string" ? value : DOWNLOAD_FOLDER);
  } catch {
    return DOWNLOAD_FOLDER;
  }
}

export function waitForDownloadComplete(
  api: DownloadsApi,
  downloadId: number,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settle(
        "reject",
        new Error(`download-failed: download ${downloadId} timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== downloadId) return;

      const state = delta.state?.current;
      if (state === "complete") {
        settle("resolve");
        return;
      }

      if (state === "interrupted") {
        const error = delta.error?.current ? ` (${delta.error.current})` : "";
        settle("reject", new Error(`download-failed: download ${downloadId} interrupted${error}`));
      }
    };

    const onErased = (erasedId: number): void => {
      if (erasedId === downloadId) {
        settle(
          "reject",
          new Error(`download-failed: download ${downloadId} was erased before completion`),
        );
      }
    };

    const settle = (type: "resolve" | "reject", error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      api.onChanged.removeListener(onChanged);
      api.onErased.removeListener(onErased);
      if (type === "resolve") resolve();
      else reject(error);
    };

    api.onChanged.addListener(onChanged);
    api.onErased.addListener(onErased);

    void api.search({ id: downloadId }).then(
      (items) => {
        if (settled) return;
        const item = items[0];
        if (item?.state === "complete") settle("resolve");
        if (item?.state === "interrupted")
          settle("reject", new Error(`download-failed: download ${downloadId} interrupted`));
      },
      () => {
        // Search is a best-effort early completion check; the final search still validates the path.
      },
    );
  });
}

async function getDownloadItem(
  api: DownloadsApi,
  downloadId: number,
): Promise<chrome.downloads.DownloadItem> {
  const items = await api.search({ id: downloadId });
  const item = items[0];

  if (!item)
    throw new Error(`download-failed: download ${downloadId} was not found after completion`);
  if (!item.filename)
    throw new Error(`download-failed: download ${downloadId} has no absolute filename`);

  return item;
}

function formatDownloadTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day}-${hours}${minutes}`;
}

function slugifySelector(selector: string): string {
  const slug = selector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  return slug || "element";
}

function sanitizeDownloadFolder(folder: string): string {
  const normalized = folder
    .split(/[\\/]+/)
    .map((part) =>
      part
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..")
    .join("/");

  return normalized || DOWNLOAD_FOLDER;
}

function shortId(id: string): string {
  const compact = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (compact || "capture").slice(0, 6);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
