import { describe, expect, it, vi } from "vitest";
import {
  buildT3ComposerIntakePayload,
  deliverToT3Composer,
  readT3ComposerStatus,
  type T3ComposerDeliveryChrome,
  type T3ComposerDeliveryTab,
} from "../../src/background/t3-composer";
import type { SavedImage } from "../../src/shared/types";

const savedImage: SavedImage = {
  downloadId: 7,
  filename: "/Users/test/Downloads/Annotations-PNG/button.png",
  requestedFilename: "Annotations-PNG/button.png",
  imageBytes: 1234,
  width: 960,
  height: 720,
};

const successfulExecuteScript: T3ComposerDeliveryChrome["scripting"]["executeScript"] = async (
  details,
) => [
  {
    result: {
      type: "t3code.composer-intake.response.v1",
      requestId: details.args[0].requestId,
      ok: true,
      status: "inserted",
    },
  },
];

describe("buildT3ComposerIntakePayload", () => {
  it("builds the T3 Composer bridge payload from a saved Annotations image", () => {
    expect(
      buildT3ComposerIntakePayload({
        markdownPrompt: "# UI Note",
        savedImage,
        requestId: "pns-test",
      }),
    ).toEqual({
      type: "t3code.composer-intake.request.v1",
      requestId: "pns-test",
      source: "annotations",
      action: "insert",
      append: true,
      focus: true,
      prompt: "# UI Note",
      image: {
        path: "/Users/test/Downloads/Annotations-PNG/button.png",
        name: "button.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        width: 960,
        height: 720,
      },
    });
  });
});

describe("deliverToT3Composer", () => {
  it("uses the direct T3 HTTP bridge before tab injection", async () => {
    const fetchApi = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, requestId: "pns-test" }),
    })) as unknown as typeof fetch;
    const api = createChromeApi({
      tabs: [
        tab({
          id: 11,
          url: "http://127.0.0.1:3773/thread/demo",
          title: "T3 Code",
        }),
      ],
      executeScript: async () => [],
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        fetchApi,
      ),
    ).resolves.toEqual({
      ok: true,
      requestId: "pns-test",
      tabId: null,
      url: "http://127.0.0.1:3773/api/annotations/composer-intake",
      mode: "http",
    });
    expect(fetchApi).toHaveBeenCalledWith(
      "http://127.0.0.1:3773/api/annotations/composer-intake",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(api.tabs.query).not.toHaveBeenCalled();
  });

  it("falls back to the legacy PointNShoot HTTP bridge when the Annotations route is unavailable", async () => {
    const fetchApi = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:3773/api/annotations/composer-intake") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => null,
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, requestId: "pns-test" }),
      };
    }) as unknown as typeof fetch;
    const api = createChromeApi({
      tabs: [],
      executeScript: async () => [],
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        fetchApi,
      ),
    ).resolves.toEqual({
      ok: true,
      requestId: "pns-test",
      tabId: null,
      url: "http://127.0.0.1:3773/api/pointnshoot/composer-intake",
      mode: "http",
    });

    expect(fetchApi).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3773/api/pointnshoot/composer-intake",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-pointnshoot-extension-id": "",
        }),
      }),
    );
    const legacyInit = vi.mocked(fetchApi).mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(legacyInit.body))).toMatchObject({
      requestId: "pns-test",
      source: "pointnshoot",
    });
    expect(api.tabs.query).not.toHaveBeenCalled();
  });

  it("falls back to a T3 tab when the HTTP bridge rejects the extension id", async () => {
    const fetchApi = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({ ok: false, reason: "annotations-extension-not-allowed" }),
    })) as unknown as typeof fetch;
    const api = createChromeApi({
      tabs: [
        tab({
          id: 11,
          url: "http://127.0.0.1:3773/thread/demo",
          title: "T3 Code",
        }),
      ],
      executeScript: successfulExecuteScript,
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        fetchApi,
      ),
    ).resolves.toEqual({
      ok: true,
      requestId: "pns-test",
      tabId: 11,
      url: "http://127.0.0.1:3773/thread/demo",
      mode: "tab",
    });

    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(api.tabs.query).toHaveBeenCalledWith({
      url: ["http://127.0.0.1/*", "http://localhost/*"],
      windowType: "normal",
    });
  });

  it("injects the payload into an existing T3 tab", async () => {
    const executeScriptCalls: unknown[] = [];
    const executeScript: T3ComposerDeliveryChrome["scripting"]["executeScript"] = async (
      details,
    ) => {
      executeScriptCalls.push(details);
      return [
        {
          result: {
            type: "t3code.composer-intake.response.v1",
            requestId: details.args[0].requestId,
            ok: true,
            status: "inserted",
          },
        },
      ];
    };
    const api = createChromeApi({
      tabs: [
        tab({
          id: 11,
          url: "http://127.0.0.1:3773/thread/demo",
          title: "T3 Code",
        }),
      ],
      executeScript,
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        createUnavailableFetch(),
      ),
    ).resolves.toEqual({
      ok: true,
      requestId: "pns-test",
      tabId: 11,
      url: "http://127.0.0.1:3773/thread/demo",
      mode: "tab",
    });
    expect(executeScriptCalls).toContainEqual(
      expect.objectContaining({
        target: { tabId: 11 },
      }),
    );
    expect(api.tabs.create).not.toHaveBeenCalled();
  });

  it("opens the default T3 origin when no existing tab responds", async () => {
    const api = createChromeApi({
      tabs: [],
      createdTab: tab({
        id: 22,
        url: "http://127.0.0.1:3773/",
        title: "T3 Code",
        status: "complete",
      }),
      executeScript: successfulExecuteScript,
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        createUnavailableFetch(),
      ),
    ).resolves.toEqual({
      ok: true,
      requestId: "pns-test",
      tabId: 22,
      url: "http://127.0.0.1:3773/",
      mode: "tab",
    });
    expect(api.tabs.create).toHaveBeenCalledWith({
      url: "http://127.0.0.1:3773",
      active: false,
    });
    expect(api.tabs.update).toHaveBeenCalledWith(22, { active: true });
  });

  it("returns a non-fatal failure when the T3 bridge does not respond", async () => {
    const api = createChromeApi({
      tabs: [
        tab({
          id: 11,
          url: "http://127.0.0.1:3773/thread/demo",
          title: "T3 Code",
        }),
      ],
      executeScript: async () => [{ result: { ok: false, reason: "t3-response-timeout" } }],
      createRejects: true,
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        createUnavailableFetch(),
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: "t3-open-failed",
      requestId: "pns-test",
    });
  });

  it("does not fall back to tabs when the HTTP bridge reports no Composer target", async () => {
    const fetchApi = vi.fn(async () => ({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ ok: false, reason: "composer-not-connected" }),
    })) as unknown as typeof fetch;
    const api = createChromeApi({
      tabs: [
        tab({
          id: 11,
          url: "http://127.0.0.1:3773/thread/demo",
          title: "T3 Code",
        }),
      ],
      executeScript: async () => [],
    });

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "pns-test",
        },
        api,
        fetchApi,
      ),
    ).resolves.toMatchObject({
      ok: false,
      requestId: "pns-test",
      reason: "composer-not-connected",
    });
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(api.tabs.query).not.toHaveBeenCalled();
  });
});

describe("readT3ComposerStatus", () => {
  it("reads the active T3 Composer target from the HTTP status bridge", async () => {
    const status = {
      ok: true,
      connected: true,
      reason: null,
      checkedAtEpochMs: 123,
      target: {
        subscriberId: "annotations-composer-test",
        threadId: "thread-test",
        threadTitle: "Integrar extensão ao Composer",
        clientKind: "desktop",
        activatedAtEpochMs: 100,
        lastSeenAtEpochMs: 120,
      },
    };
    const fetchApi = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => status,
    })) as unknown as typeof fetch;

    await expect(readT3ComposerStatus({ requestId: "pns-test" }, fetchApi)).resolves.toEqual(
      status,
    );
    expect(fetchApi).toHaveBeenCalledWith(
      "http://127.0.0.1:3773/api/annotations/composer-intake/status",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("falls back to the legacy PointNShoot status bridge when the Annotations route is unavailable", async () => {
    const status = {
      ok: true,
      connected: true,
      reason: null,
      checkedAtEpochMs: 123,
      target: {
        subscriberId: "pointnshoot-composer-test",
        threadId: "thread-test",
        threadTitle: "Integrar extensão ao Composer",
        clientKind: "desktop",
        activatedAtEpochMs: 100,
        lastSeenAtEpochMs: 120,
      },
    };
    const fetchApi = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:3773/api/annotations/composer-intake/status") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => null,
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => status,
      };
    }) as unknown as typeof fetch;

    await expect(readT3ComposerStatus({ requestId: "pns-test" }, fetchApi)).resolves.toEqual(
      status,
    );
    expect(fetchApi).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3773/api/pointnshoot/composer-intake/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-pointnshoot-extension-id": "",
        }),
      }),
    );
  });

  it("returns an actionable status failure when T3 is unreachable", async () => {
    await expect(
      readT3ComposerStatus({ requestId: "pns-test" }, createUnavailableFetch()),
    ).resolves.toMatchObject({
      ok: false,
      reason: "t3-status-http-failed",
    });
  });
});

function createChromeApi(input: {
  tabs: T3ComposerDeliveryTab[];
  createdTab?: T3ComposerDeliveryTab;
  executeScript: T3ComposerDeliveryChrome["scripting"]["executeScript"];
  createRejects?: boolean;
}): T3ComposerDeliveryChrome {
  const createdTab = input.createdTab ?? tab({ id: 99, url: "http://127.0.0.1:3773/" });
  return {
    tabs: {
      query: vi.fn(async () => input.tabs),
      create: input.createRejects
        ? vi.fn(async () => {
            throw new Error("create failed");
          })
        : vi.fn(async () => createdTab),
      get: vi.fn(async () => createdTab),
      update: vi.fn(async () => createdTab),
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    scripting: {
      executeScript: input.executeScript,
    },
  };
}

function createUnavailableFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
}

function tab(input: Partial<T3ComposerDeliveryTab>): T3ComposerDeliveryTab {
  return {
    active: false,
    id: 1,
    status: "complete",
    windowId: 1,
    ...input,
  };
}
