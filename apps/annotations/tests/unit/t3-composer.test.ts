import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetT3BridgeStorageForTests,
  __setT3BridgeTokenForTests,
  buildT3ComposerIntakePayload,
  deliverToT3Composer,
  readT3ComposerStatus,
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

const bridgeManifest = {
  protocolVersion: 1,
  appVersion: "0.0.24",
  pairingRequired: true,
  bridgeEnabled: true,
  status: "ready",
};

beforeEach(() => {
  __resetT3BridgeStorageForTests();
});

describe("buildT3ComposerIntakePayload", () => {
  it("builds the T3 Composer bridge payload from a saved Annotations image", () => {
    expect(
      buildT3ComposerIntakePayload({
        markdownPrompt: "# UI Note",
        savedImage,
        requestId: "annotations-test",
      }),
    ).toEqual({
      type: "t3code.external-composer-intake.request.v1",
      requestId: "annotations-test",
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

  it("uses the requested PNG name when Chrome returns an extensionless download path", () => {
    expect(
      buildT3ComposerIntakePayload({
        markdownPrompt: "# UI Note",
        savedImage: {
          ...savedImage,
          filename: "/var/folders/test/temporary-download-artifact",
          requestedFilename: "Annotations-PNG/button.png",
        },
        requestId: "annotations-test",
      }).image.name,
    ).toBe("button.png");
  });
});

describe("deliverToT3Composer", () => {
  it("uses the paired Annotations bridge token for delivery", async () => {
    __setT3BridgeTokenForTests("paired-token");
    const fetchApi = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/manifest") {
        return {
          ok: true,
          status: 200,
          json: async () => bridgeManifest,
        };
      }
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/v1/deliver") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer paired-token",
          "content-type": "application/json",
        });
        expect(JSON.parse(String(init?.body))).toMatchObject({
          type: "t3code.annotations.bridge.deliver.v1",
          requestId: "annotations-test",
          prompt: "# UI Note",
          image: {
            path: "/Users/test/Downloads/Annotations-PNG/button.png",
          },
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, requestId: "annotations-test" }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as unknown as typeof fetch;

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "annotations-test",
        },
        fetchApi,
      ),
    ).resolves.toEqual({
      ok: true,
      requestId: "annotations-test",
      url: "http://127.0.0.1:3773/api/annotations/bridge/v1/deliver",
    });
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });

  it("requests pairing instead of falling back to tab injection when no token exists", async () => {
    const fetchApi = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/manifest") {
        return {
          ok: true,
          status: 200,
          json: async () => bridgeManifest,
        };
      }
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/v1/pairing/request") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            requestId: "pairing-request",
            pollSecret: "poll-secret",
            status: "pending",
            expiresAtEpochMs: Date.now() + 60_000,
          }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as unknown as typeof fetch;

    await expect(
      deliverToT3Composer(
        {
          markdownPrompt: "# UI Note",
          savedImage,
          requestId: "annotations-test",
        },
        fetchApi,
      ),
    ).resolves.toMatchObject({
      ok: false,
      requestId: "annotations-test",
      reason: "pairing-pending",
    });
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });
});

describe("readT3ComposerStatus", () => {
  it("reads the active T3 Composer target from the paired bridge status endpoint", async () => {
    __setT3BridgeTokenForTests("paired-token");
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
    const fetchApi = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/manifest") {
        return {
          ok: true,
          status: 200,
          json: async () => bridgeManifest,
        };
      }
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/v1/status") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer paired-token",
        });
        return {
          ok: true,
          status: 200,
          json: async () => status,
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as unknown as typeof fetch;

    await expect(
      readT3ComposerStatus({ requestId: "annotations-test" }, fetchApi),
    ).resolves.toEqual(status);
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });

  it("creates a pairing request when the bridge is enabled but not paired", async () => {
    const fetchApi = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/manifest") {
        return {
          ok: true,
          status: 200,
          json: async () => bridgeManifest,
        };
      }
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/v1/pairing/request") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            requestId: "pairing-request",
            pollSecret: "poll-secret",
            status: "pending",
            expiresAtEpochMs: Date.now() + 60_000,
          }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as unknown as typeof fetch;

    await expect(
      readT3ComposerStatus({ requestId: "annotations-test" }, fetchApi),
    ).resolves.toMatchObject({
      ok: false,
      reason: "pairing-pending",
    });
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });

  it("reports a protocol mismatch when T3 exposes an unsupported bridge version", async () => {
    const fetchApi = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:3773/api/annotations/bridge/manifest") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...bridgeManifest,
            protocolVersion: 99,
          }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as unknown as typeof fetch;

    await expect(
      readT3ComposerStatus({ requestId: "annotations-test" }, fetchApi),
    ).resolves.toMatchObject({
      ok: false,
      reason: "protocol-version-mismatch",
    });
    expect(fetchApi).toHaveBeenCalledTimes(1);
  });

  it("returns an actionable status failure when T3 is unreachable", async () => {
    await expect(
      readT3ComposerStatus({ requestId: "annotations-test" }, createUnavailableFetch()),
    ).resolves.toMatchObject({
      ok: false,
      reason: "app-unreachable",
    });
  });
});

function createUnavailableFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
}
