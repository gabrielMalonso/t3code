import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDownloadFilename,
  getConfiguredDownloadFolder,
  type DownloadsApi,
  downloadRenderedPng,
} from "../../src/background/downloads";
import type { CaptureRequest } from "../../src/shared/types";

type Listener<T> = (event: T) => void;

function createEvent<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    addListener(listener: Listener<T>) {
      listeners.add(listener);
    },
    removeListener(listener: Listener<T>) {
      listeners.delete(listener);
    },
    emit(event: T) {
      for (const listener of Array.from(listeners)) listener(event);
    },
    count() {
      return listeners.size;
    },
  };
}

function createApi(searchResults: chrome.downloads.DownloadItem[][]): DownloadsApi & {
  onChanged: ReturnType<typeof createEvent<chrome.downloads.DownloadDelta>>;
  onErased: ReturnType<typeof createEvent<number>>;
  download: ReturnType<typeof vi.fn<() => Promise<number>>>;
  search: ReturnType<
    typeof vi.fn<
      (query: chrome.downloads.DownloadQuery) => Promise<chrome.downloads.DownloadItem[]>
    >
  >;
} {
  const onChanged = createEvent<chrome.downloads.DownloadDelta>();
  const onErased = createEvent<number>();
  return {
    download: vi.fn(async () => 7),
    search: vi.fn(async () => searchResults.shift() ?? []),
    onChanged,
    onErased,
  };
}

const baseInput = {
  imageDataUrl: "data:image/png;base64,abc",
  requestedFilename: "Annotations-PNG/2026-05-25-1900-button-buy-capture1.png",
  imageBytes: 123,
  width: 800,
  height: 600,
};

describe("background downloads", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("generates the requested Downloads-relative filename", () => {
    const request = {
      id: "capture-12345678-abcdef",
      createdAt: "2026-05-25T19:07:00.000Z",
      element: {
        shortSelector: 'button[data-testid="Buy CTA"]',
      },
    } as CaptureRequest;

    expect(buildDownloadFilename(request, { now: new Date("2026-05-25T19:07:00") })).toBe(
      "Annotations-PNG/2026-05-25-1907-button-data-testid-buy-cta-captur.png",
    );
  });

  it("redacts sensitive selector values from the requested filename", () => {
    const request = {
      id: "capture-12345678-abcdef",
      createdAt: "2026-05-25T19:07:00.000Z",
      element: {
        shortSelector: 'button[aria-label="Comprar para ana@example.com CPF 123.456.789-10"]',
      },
    } as CaptureRequest;

    const filename = buildDownloadFilename(request, { now: new Date("2026-05-25T19:07:00") });

    expect(filename).toBe(
      "Annotations-PNG/2026-05-25-1907-button-aria-label-comprar-para-email-captur.png",
    );
    expect(filename).not.toContain("ana");
    expect(filename).not.toContain("example");
    expect(filename).not.toContain("123");
  });

  it("allows the Downloads subfolder to be configured safely", async () => {
    await expect(
      getConfiguredDownloadFolder({
        get: vi.fn(async () => ({ annotationsDownloadFolder: "../Custom Notes//UI Shots" })),
      }),
    ).resolves.toBe("Custom-Notes/UI-Shots");
    await expect(getConfiguredDownloadFolder({ get: vi.fn(async () => ({})) })).resolves.toBe(
      "Annotations-PNG",
    );
  });

  it("downloads, waits for completion and returns the absolute filename", async () => {
    const api = createApi([
      [item({ id: 7, state: "in_progress" })],
      [
        item({
          id: 7,
          state: "complete",
          filename: "/Users/test/Downloads/Annotations-PNG/file.png",
        }),
      ],
    ]);

    const promise = downloadRenderedPng(baseInput, api, 1_000);
    await vi.waitFor(() => expect(api.onChanged.count()).toBe(1));
    api.onChanged.emit({ id: 7, state: { current: "complete" } } as chrome.downloads.DownloadDelta);

    await expect(promise).resolves.toMatchObject({
      downloadId: 7,
      filename: "/Users/test/Downloads/Annotations-PNG/file.png",
      requestedFilename: baseInput.requestedFilename,
      imageBytes: 123,
      width: 800,
      height: 600,
    });
    expect(api.download).toHaveBeenCalledWith({
      url: baseInput.imageDataUrl,
      filename: baseInput.requestedFilename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    expect(api.onChanged.count()).toBe(0);
    expect(api.onErased.count()).toBe(0);
  });

  it("uses the real filename returned by Chrome when uniquify changes it", async () => {
    const api = createApi([
      [item({ id: 7, state: "in_progress" })],
      [
        item({
          id: 7,
          state: "complete",
          filename: "/Users/test/Downloads/Annotations-PNG/file (1).png",
        }),
      ],
    ]);

    const promise = downloadRenderedPng(baseInput, api, 1_000);
    await vi.waitFor(() => expect(api.onChanged.count()).toBe(1));
    api.onChanged.emit({ id: 7, state: { current: "complete" } } as chrome.downloads.DownloadDelta);

    await expect(promise).resolves.toMatchObject({
      filename: "/Users/test/Downloads/Annotations-PNG/file (1).png",
      requestedFilename: baseInput.requestedFilename,
    });
  });

  it("rejects interrupted downloads and cleans listeners", async () => {
    const api = createApi([[item({ id: 7, state: "in_progress" })]]);

    const promise = downloadRenderedPng(baseInput, api, 1_000);
    await vi.waitFor(() => expect(api.onChanged.count()).toBe(1));
    api.onChanged.emit({
      id: 7,
      state: { current: "interrupted" },
      error: { current: "FILE_FAILED" },
    } as chrome.downloads.DownloadDelta);

    await expect(promise).rejects.toThrow("download-failed");
    expect(api.onChanged.count()).toBe(0);
    expect(api.onErased.count()).toBe(0);
  });

  it("rejects erased downloads and cleans listeners", async () => {
    const api = createApi([[item({ id: 7, state: "in_progress" })]]);

    const promise = downloadRenderedPng(baseInput, api, 1_000);
    await vi.waitFor(() => expect(api.onErased.count()).toBe(1));
    api.onErased.emit(7);

    await expect(promise).rejects.toThrow("erased");
    expect(api.onChanged.count()).toBe(0);
    expect(api.onErased.count()).toBe(0);
  });

  it("rejects on timeout and cleans listeners", async () => {
    vi.useFakeTimers();
    const api = createApi([[item({ id: 7, state: "in_progress" })]]);

    const promise = downloadRenderedPng(baseInput, api, 50);
    const expectation = expect(promise).rejects.toThrow("timed out");
    await Promise.resolve();
    await Promise.resolve();
    expect(api.onChanged.count()).toBe(1);
    await vi.advanceTimersByTimeAsync(51);

    await expectation;
    expect(api.onChanged.count()).toBe(0);
    expect(api.onErased.count()).toBe(0);
  });

  it("rejects when completion search cannot confirm the item", async () => {
    const api = createApi([[item({ id: 7, state: "in_progress" })], []]);

    const promise = downloadRenderedPng(baseInput, api, 1_000);
    await vi.waitFor(() => expect(api.onChanged.count()).toBe(1));
    api.onChanged.emit({ id: 7, state: { current: "complete" } } as chrome.downloads.DownloadDelta);

    await expect(promise).rejects.toThrow("was not found");
  });
});

function item(partial: Partial<chrome.downloads.DownloadItem>): chrome.downloads.DownloadItem {
  return {
    id: partial.id ?? 7,
    url: "data:image/png;base64,abc",
    finalUrl: "data:image/png;base64,abc",
    filename: partial.filename ?? "",
    danger: "safe",
    mime: "image/png",
    startTime: "2026-05-25T19:00:00.000Z",
    state: partial.state ?? "complete",
    paused: false,
    canResume: false,
    incognito: false,
    exists: true,
    bytesReceived: 123,
    totalBytes: 123,
    fileSize: 123,
    ...partial,
  } as chrome.downloads.DownloadItem;
}
