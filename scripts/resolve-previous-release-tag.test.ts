import { describe, expect, it } from "vitest";

import { resolvePreviousReleaseTag } from "./resolve-previous-release-tag.ts";

describe("resolvePreviousReleaseTag", () => {
  it("ignores prerelease tags when resolving the previous stable release", () => {
    expect(
      resolvePreviousReleaseTag("stable", "v1.2.3", [
        "v1.2.3-rc.1",
        "v1.2.2",
        "v1.2.2-rc.2",
        "v1.2.1",
      ]),
    ).toBe("v1.2.2");
  });

  it("keeps prerelease-aware ordering for nightly release tags", () => {
    expect(
      resolvePreviousReleaseTag("nightly", "nightly-v1.2.3-nightly.20260416.9", [
        "nightly-v1.2.3-nightly.20260416.8",
        "nightly-v1.2.3-nightly.20260415.99",
      ]),
    ).toBe("nightly-v1.2.3-nightly.20260416.8");
  });
});
