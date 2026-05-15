import type { EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";

import {
  activateMobileEnvironmentConnection,
  readEnvironmentConnection,
  resetRuntimeForClosedEnvironment,
} from "../environments/runtime";
import { fetchRemoteSessionState } from "../environments/remote/api";
import { bindLocalApiToRpcClient, clearLocalApiBinding } from "../localApi";
import { useStore } from "../store";
import { revokeMobileBearerAssetBlobUrls } from "./assets";
import {
  getMobileProfile,
  useMobileProfileStore,
  type MobileConnectionProfile,
} from "./profileStorage";

type MobileRuntimeStatus = "neutral" | "connecting" | "connected" | "error";

interface MobileRuntimeState {
  readonly activeProfileId: string | null;
  readonly activeEnvironmentId: EnvironmentId | null;
  readonly status: MobileRuntimeStatus;
  readonly errorMessage: string | null;
  readonly setConnecting: (profileId: string, environmentId: EnvironmentId) => void;
  readonly setConnected: (profileId: string, environmentId: EnvironmentId) => void;
  readonly setNeutral: () => void;
  readonly setError: (message: string) => void;
}

export const useMobileRuntimeStore = create<MobileRuntimeState>((set) => ({
  activeProfileId: null,
  activeEnvironmentId: null,
  status: "neutral",
  errorMessage: null,
  setConnecting: (profileId, environmentId) =>
    set({
      activeProfileId: profileId,
      activeEnvironmentId: environmentId,
      status: "connecting",
      errorMessage: null,
    }),
  setConnected: (profileId, environmentId) =>
    set({
      activeProfileId: profileId,
      activeEnvironmentId: environmentId,
      status: "connected",
      errorMessage: null,
    }),
  setNeutral: () =>
    set({
      activeProfileId: null,
      activeEnvironmentId: null,
      status: "neutral",
      errorMessage: null,
    }),
  setError: (message) =>
    set({
      activeProfileId: null,
      activeEnvironmentId: null,
      status: "error",
      errorMessage: message,
    }),
}));

function assertSessionFresh(profile: MobileConnectionProfile): void {
  const expiresAtMs = Date.parse(profile.sessionExpiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("Session expired. Pair this profile again.");
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getActiveMobileProfile(): MobileConnectionProfile | null {
  const profileId = useMobileRuntimeStore.getState().activeProfileId;
  return profileId ? getMobileProfile(profileId) : null;
}

export async function activateMobileProfile(profileId: string): Promise<void> {
  const runtime = useMobileRuntimeStore.getState();
  if (runtime.activeProfileId && runtime.activeProfileId !== profileId) {
    throw new Error("Close the current environment before activating another one.");
  }

  const profile = getMobileProfile(profileId);
  if (!profile) {
    throw new Error("Mobile profile not found.");
  }

  assertSessionFresh(profile);
  useMobileRuntimeStore.getState().setConnecting(profile.profileId, profile.environmentId);
  try {
    const sessionState = await fetchRemoteSessionState({
      httpBaseUrl: profile.httpBaseUrl,
      bearerToken: profile.bearerToken,
    });
    if (!sessionState.authenticated) {
      throw new Error("Invalid session. Pair this profile again.");
    }

    const connection = await activateMobileEnvironmentConnection({
      record: {
        environmentId: profile.environmentId,
        label: profile.label,
        httpBaseUrl: profile.httpBaseUrl,
        wsBaseUrl: profile.wsBaseUrl,
      },
      bearerToken: profile.bearerToken,
    });
    bindLocalApiToRpcClient(connection.client);

    const connectedAt = new Date().toISOString();
    await useMobileProfileStore.getState().markConnected(profile.profileId, connectedAt);
    useStore.getState().setActiveEnvironmentId(profile.environmentId);
    useMobileRuntimeStore.getState().setConnected(profile.profileId, profile.environmentId);
  } catch (error) {
    useMobileRuntimeStore.getState().setError(formatError(error));
    clearLocalApiBinding();
    await resetRuntimeForClosedEnvironment(profile.environmentId);
    throw error;
  }
}

export async function closeActiveMobileProfile(): Promise<void> {
  const profileId = useMobileRuntimeStore.getState().activeProfileId;
  const environmentId = useMobileRuntimeStore.getState().activeEnvironmentId;
  await resetRuntimeForClosedEnvironment(environmentId ?? undefined);
  clearLocalApiBinding();
  if (profileId) {
    revokeMobileBearerAssetBlobUrls(profileId);
  }
  useMobileRuntimeStore.getState().setNeutral();
}

export async function reconnectActiveMobileProfile(): Promise<void> {
  const profile = getActiveMobileProfile();
  if (!profile) {
    throw new Error("No active profile.");
  }
  assertSessionFresh(profile);
  const connection = readEnvironmentConnection(profile.environmentId);
  if (!connection) {
    await activateMobileProfile(profile.profileId);
    return;
  }
  await connection.reconnect();
}

export async function reconnectActiveMobileProfileIfStale(): Promise<boolean> {
  const profile = getActiveMobileProfile();
  if (!profile) {
    return false;
  }

  assertSessionFresh(profile);
  const connection = readEnvironmentConnection(profile.environmentId);
  if (!connection) {
    await activateMobileProfile(profile.profileId);
    return true;
  }

  if (connection.client.isHeartbeatFresh()) {
    return false;
  }

  await connection.reconnect();
  return true;
}
