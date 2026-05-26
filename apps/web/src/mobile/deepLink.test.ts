import { describe, expect, it } from "vitest";

import { parseMobilePairingDeepLink } from "./deepLink";

describe("mobile deep links", () => {
  it("parses custom-scheme Tailscale pairing links", () => {
    expect(
      parseMobilePairingDeepLink(
        "tools.t3code.mobile://pair?host=http%3A%2F%2F100.64.1.2%3A3774&mode=tailscale#token=PAIRCODE",
      ),
    ).toEqual({
      pairingInput: "PAIRCODE",
      host: "http://100.64.1.2:3774",
      mode: "tailscale",
    });
  });

  it("turns LAN host and token links into a full backend pairing URL", () => {
    expect(
      parseMobilePairingDeepLink(
        "tools.t3code.mobile://pair?host=192.168.1.44%3A3774&mode=lan#token=PAIRCODE",
      ),
    ).toEqual({
      pairingInput: "http://192.168.1.44:3774/pair#token=PAIRCODE",
      host: "",
      mode: "lan",
    });
  });

  it("can carry a full pairing URL when a launcher already has one", () => {
    expect(
      parseMobilePairingDeepLink(
        "tools.t3code.mobile://pair?url=http%3A%2F%2F192.168.1.44%3A3774%2Fpair%23token%3DPAIRCODE",
      ),
    ).toEqual({
      pairingInput: "http://192.168.1.44:3774/pair#token=PAIRCODE",
      host: "",
      mode: "lan",
    });
  });

  it("infers Tailscale from hosted app pairing URLs", () => {
    expect(
      parseMobilePairingDeepLink(
        "tools.t3code.mobile://pair?url=https%3A%2F%2Fapp.t3.codes%2Fpair%3Fhost%3Dhttp%253A%252F%252F100.64.1.2%253A3774%252F%23token%3DPAIRCODE",
      ),
    ).toEqual({
      pairingInput:
        "https://app.t3.codes/pair?host=http%3A%2F%2F100.64.1.2%3A3774%2F#token=PAIRCODE",
      host: "",
      mode: "tailscale",
    });
  });

  it("ignores unrelated URLs", () => {
    expect(parseMobilePairingDeepLink("tools.t3code.mobile://settings")).toBeNull();
    expect(parseMobilePairingDeepLink("http://127.0.0.1:3774/pair#token=PAIRCODE")).toBeNull();
  });
});
