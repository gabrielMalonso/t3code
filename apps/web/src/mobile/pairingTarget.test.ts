import { beforeEach, describe, expect, it } from "vitest";

import {
  inferMobileConnectionModeFromPairingInput,
  resolveMobilePairingTarget,
} from "./pairingTarget";

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

describe("inferMobileConnectionModeFromPairingInput", () => {
  it("infers LAN for private LAN pairing urls", () => {
    expect(
      inferMobileConnectionModeFromPairingInput(
        "http://192.168.15.12:3774/pair#token=EJTVFWLYUVKM",
      ),
    ).toBe("lan");
  });

  it("infers Tailscale for 100.x and ts.net pairing urls", () => {
    expect(
      inferMobileConnectionModeFromPairingInput(
        "http://100.101.102.103:3774/pair#token=EJTVFWLYUVKM",
      ),
    ).toBe("tailscale");
    expect(
      inferMobileConnectionModeFromPairingInput(
        "http://macbook.tailnet.ts.net:3774/pair#token=EJTVFWLYUVKM",
      ),
    ).toBe("tailscale");
  });
});
