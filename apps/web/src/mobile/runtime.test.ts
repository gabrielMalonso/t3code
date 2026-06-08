import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reconnectActiveMobileProfileIfStale, useMobileRuntimeStore } from "./runtime";
import { useMobileProfileStore, type MobileConnectionProfile } from "./profileStorage";

const mockActivateMobileEnvironmentConnection = vi.hoisted(() => vi.fn());
const mockReadEnvironmentConnection = vi.hoisted(() => vi.fn());
const mockResetRuntimeForClosedEnvironment = vi.hoisted(() => vi.fn());
const mockFetchRemoteSessionState = vi.hoisted(() => vi.fn());

vi.mock("../environments/runtime", () => ({
  activateMobileEnvironmentConnection: mockActivateMobileEnvironmentConnection,
  readEnvironmentConnection: mockReadEnvironmentConnection,
  resetRuntimeForClosedEnvironment: mockResetRuntimeForClosedEnvironment,
}));

vi.mock("@t3tools/client-runtime", () => ({
  fetchRemoteSessionState: mockFetchRemoteSessionState,
}));

vi.mock("../lib/runtime", () => ({
  remoteHttpRuntime: {
    runPromise: (effect: Promise<unknown>) => effect,
  },
}));

function makeProfile(input?: Partial<MobileConnectionProfile>): MobileConnectionProfile {
  return {
    profileId: "lan-profile",
    environmentId: EnvironmentId.make("environment-mobile"),
    label: "Mobile LAN",
    mode: "lan",
    httpBaseUrl: "http://192.168.15.12:3774/",
    wsBaseUrl: "ws://192.168.15.12:3774/",
    bearerToken: "bearer-token",
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: "2026-05-15T00:00:00.000Z",
    lastConnectedAt: null,
    ...input,
  };
}

describe("mobile runtime store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMobileProfileStore.setState({
      hydrated: true,
      profiles: [],
    });
  });

  afterEach(() => {
    useMobileRuntimeStore.getState().setNeutral();
    useMobileProfileStore.setState({
      hydrated: false,
      profiles: [],
    });
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

  it("does not reconnect a healthy active mobile connection after app resume", async () => {
    const profile = makeProfile();
    const reconnect = vi.fn(async () => undefined);
    const isHeartbeatFresh = vi.fn(() => true);
    useMobileProfileStore.setState({ hydrated: true, profiles: [profile] });
    useMobileRuntimeStore.getState().setConnected(profile.profileId, profile.environmentId);
    mockReadEnvironmentConnection.mockReturnValue({
      client: { isHeartbeatFresh },
      reconnect,
    });

    await expect(reconnectActiveMobileProfileIfStale()).resolves.toBe(false);

    expect(isHeartbeatFresh).toHaveBeenCalledTimes(1);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("reconnects a stale active mobile connection after app resume", async () => {
    const profile = makeProfile();
    const reconnect = vi.fn(async () => undefined);
    const isHeartbeatFresh = vi.fn(() => false);
    useMobileProfileStore.setState({ hydrated: true, profiles: [profile] });
    useMobileRuntimeStore.getState().setConnected(profile.profileId, profile.environmentId);
    mockReadEnvironmentConnection.mockReturnValue({
      client: { isHeartbeatFresh },
      reconnect,
    });

    await expect(reconnectActiveMobileProfileIfStale()).resolves.toBe(true);

    expect(isHeartbeatFresh).toHaveBeenCalledTimes(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
