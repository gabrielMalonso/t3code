import { beforeEach, describe, expect, it } from "vitest";

import { resolveMobilePairingTarget } from "./pairingTarget";

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: "https://app.example.com",
      },
    },
  });
});

describe("resolveMobilePairingTarget", () => {
  it("derives the mobile backend target directly from a scanned pairing url", () => {
    expect(
      resolveMobilePairingTarget({
        pairingUrlOrToken: "http://192.168.15.12:3774/pair#token=EJTVFWLYUVKM",
        host: "",
      }),
    ).toEqual({
      credential: "EJTVFWLYUVKM",
      suggestedHttpBaseUrl: "http://192.168.15.12:3774/",
      httpBaseUrl: "http://192.168.15.12:3774/",
      wsBaseUrl: "ws://192.168.15.12:3774/",
    });
  });

  it("requires a host when the scanner only returns a bare pairing code", () => {
    expect(() =>
      resolveMobilePairingTarget({
        pairingUrlOrToken: "EJTVFWLYUVKM",
        host: "",
      }),
    ).toThrow("Informe o host do backend.");
  });
});
