import { afterEach, assert, describe, it, vi } from "vitest";

import { isWindowsPlatform, resolveConnectionToken, withOptionalToken } from "./utils";

const originalWindow = globalThis.window;

afterEach(() => {
  if (typeof originalWindow !== "undefined") {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  vi.unstubAllEnvs();
});

describe("isWindowsPlatform", () => {
  it("matches Windows platform identifiers", () => {
    assert.isTrue(isWindowsPlatform("Win32"));
    assert.isTrue(isWindowsPlatform("Windows"));
    assert.isTrue(isWindowsPlatform("windows_nt"));
  });

  it("does not match darwin", () => {
    assert.isFalse(isWindowsPlatform("darwin"));
  });
});

describe("resolveConnectionToken", () => {
  it("prefers the explicit websocket url token", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://localhost:3773/?token=page-token" },
        desktopBridge: {
          getWsUrl: () => "ws://localhost:3773/?token=bridge-token",
        },
      },
    });
    vi.stubEnv("VITE_WS_URL", "ws://localhost:3773/?token=env-token");

    assert.equal(resolveConnectionToken("ws://localhost:3773/?token=url-token"), "url-token");
  });

  it("falls back to the current browser url token", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://192.168.0.15:3773/?token=page-token" },
        desktopBridge: undefined,
      },
    });

    assert.equal(resolveConnectionToken(), "page-token");
  });
});

describe("withOptionalToken", () => {
  it("adds a token query param when present", () => {
    assert.equal(
      withOptionalToken("http://192.168.0.15:3773", "secret-token"),
      "http://192.168.0.15:3773/?token=secret-token",
    );
  });

  it("leaves the url alone when no token is available", () => {
    assert.equal(withOptionalToken("http://192.168.0.15:3773", null), "http://192.168.0.15:3773");
  });
});
