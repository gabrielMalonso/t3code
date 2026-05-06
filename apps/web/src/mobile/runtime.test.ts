import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { useMobileRuntimeStore } from "./runtime";

describe("mobile runtime store", () => {
  afterEach(() => {
    useMobileRuntimeStore.getState().setNeutral();
  });

  it("clears the active profile when activation fails", () => {
    const environmentId = EnvironmentId.make("environment-mobile");

    useMobileRuntimeStore.getState().setConnecting("lan-profile", environmentId);
    useMobileRuntimeStore.getState().setError("Connection failed.");

    expect(useMobileRuntimeStore.getState()).toMatchObject({
      activeEnvironmentId: null,
      activeProfileId: null,
      errorMessage: "Connection failed.",
      status: "error",
    });
  });
});
