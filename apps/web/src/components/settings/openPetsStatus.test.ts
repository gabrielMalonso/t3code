import { describe, expect, it } from "vitest";
import type { OpenPetsRuntimeStatus } from "@t3tools/contracts";

import { describeOpenPetsStatus } from "./openPetsStatus";

const baseStatus: OpenPetsRuntimeStatus = {
  supported: true,
  enabled: true,
  binaryPath: "openpets",
  cliAvailable: true,
  petReachable: true,
  lastError: null,
  lastEventAt: null,
};

describe("describeOpenPetsStatus", () => {
  it("shows loading before a status is available", () => {
    expect(describeOpenPetsStatus(null, true, null)).toMatchObject({
      label: "Loading",
      tone: "muted",
    });
  });

  it("prioritizes macOS support and disabled states", () => {
    expect(describeOpenPetsStatus({ ...baseStatus, supported: false }, false, null)).toMatchObject({
      label: "macOS only",
    });
    expect(describeOpenPetsStatus({ ...baseStatus, enabled: false }, false, null)).toMatchObject({
      label: "Disabled",
    });
  });

  it("reports CLI and pet reachability problems", () => {
    expect(
      describeOpenPetsStatus({ ...baseStatus, cliAvailable: false }, false, null),
    ).toMatchObject({
      label: "CLI not found",
      tone: "warning",
    });
    expect(
      describeOpenPetsStatus({ ...baseStatus, petReachable: false }, false, null),
    ).toMatchObject({
      label: "Pet not reachable",
      tone: "warning",
    });
  });

  it("reports last send failures and ready state", () => {
    expect(
      describeOpenPetsStatus({ ...baseStatus, lastError: "socket closed" }, false, null),
    ).toMatchObject({
      label: "Last send failed",
      tone: "error",
    });
    expect(describeOpenPetsStatus(baseStatus, false, null)).toMatchObject({
      label: "Ready",
      tone: "success",
    });
  });
});
