import { beforeEach, describe, expect, it } from "vitest";

import { resolveMobileBearerAssetFetchUrl } from "./assets";

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: "capacitor://localhost",
      },
    },
  });
});

describe("resolveMobileBearerAssetFetchUrl", () => {
  it("rewrites asset requests to the active mobile profile base URL", () => {
    expect(
      resolveMobileBearerAssetFetchUrl({
        profileHttpBaseUrl: "http://100.71.185.10:3773/",
        url: "http://192.168.15.12:3773/attachments/image-1?size=full#ignored",
      }),
    ).toBe("http://100.71.185.10:3773/attachments/image-1?size=full");
  });

  it("resolves relative asset requests against the active mobile profile base URL", () => {
    expect(
      resolveMobileBearerAssetFetchUrl({
        profileHttpBaseUrl: "http://192.168.15.12:3773/",
        url: "/api/project-favicon?cwd=%2Fworkspace",
      }),
    ).toBe("http://192.168.15.12:3773/api/project-favicon?cwd=%2Fworkspace");
  });
});
