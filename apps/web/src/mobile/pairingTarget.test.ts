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

  it("uses an explicit host while extracting the credential from a pairing url", () => {
    expect(
      resolveMobilePairingTarget({
        pairingUrlOrToken: "http://192.168.15.12:3774/pair#token=EJTVFWLYUVKM",
        host: "100.101.102.103:3774",
      }),
    ).toEqual({
      credential: "EJTVFWLYUVKM",
      suggestedHttpBaseUrl: "http://192.168.15.12:3774/",
      httpBaseUrl: "http://100.101.102.103:3774/",
      wsBaseUrl: "ws://100.101.102.103:3774/",
    });
  });

  it("inherits the pairing url port when an explicit host has no port", () => {
    expect(
      resolveMobilePairingTarget({
        pairingUrlOrToken: "http://192.168.15.12:3773/pair#token=BJL68TGTBXAR",
        host: "100.71.185.10",
      }),
    ).toEqual({
      credential: "BJL68TGTBXAR",
      suggestedHttpBaseUrl: "http://192.168.15.12:3773/",
      httpBaseUrl: "http://100.71.185.10:3773/",
      wsBaseUrl: "ws://100.71.185.10:3773/",
    });
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
