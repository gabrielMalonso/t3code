import type { EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";

import { randomUUID } from "../lib/utils";
import type { MobileConnectionMode } from "./pairingTarget";
import {
  readMobileProfileSecret,
  removeMobileProfileSecret,
  writeMobileProfileSecret,
} from "./secretStorage";

export interface MobileConnectionProfile {
  readonly profileId: string;
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly mode: MobileConnectionMode;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly bearerToken: string;
  readonly sessionExpiresAt: string;
  readonly createdAt: string;
  readonly lastConnectedAt: string | null;
}

interface MobileProfileDocument {
  readonly version: 1;
  readonly profiles: ReadonlyArray<PersistedMobileConnectionProfile>;
}

type PersistedMobileConnectionProfile = Omit<MobileConnectionProfile, "bearerToken"> & {
  readonly bearerToken?: string;
};

interface MobileProfileStore {
  readonly hydrated: boolean;
  readonly profiles: ReadonlyArray<MobileConnectionProfile>;
  readonly hydrate: () => Promise<void>;
  readonly upsert: (profile: MobileConnectionProfile) => Promise<void>;
  readonly remove: (profileId: string) => Promise<void>;
  readonly markConnected: (profileId: string, connectedAt: string) => Promise<void>;
}

const MOBILE_PROFILE_STORAGE_KEY = "t3code:mobile-profiles:v1";
let hydrationPromise: Promise<void> | null = null;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

async function readStorageValue(): Promise<string | null> {
  if (!hasWindow()) {
    return null;
  }

  try {
    const { Preferences } = await import("@capacitor/preferences");
    const result = await Preferences.get({ key: MOBILE_PROFILE_STORAGE_KEY });
    return result.value;
  } catch {
    return window.localStorage.getItem(MOBILE_PROFILE_STORAGE_KEY);
  }
}

async function writeStorageValue(value: string): Promise<void> {
  if (!hasWindow()) {
    return;
  }

  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: MOBILE_PROFILE_STORAGE_KEY, value });
    return;
  } catch {
    window.localStorage.setItem(MOBILE_PROFILE_STORAGE_KEY, value);
  }
}

function parseProfileDocument(raw: string | null): MobileProfileDocument {
  if (!raw) {
    return { version: 1, profiles: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MobileProfileDocument>;
    if (!Array.isArray(parsed.profiles)) {
      return { version: 1, profiles: [] };
    }
    return {
      version: 1,
      profiles: parsed.profiles.filter(isPersistedMobileConnectionProfile),
    };
  } catch {
    return { version: 1, profiles: [] };
  }
}

function isPersistedMobileConnectionProfile(
  value: unknown,
): value is PersistedMobileConnectionProfile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PersistedMobileConnectionProfile>;
  return (
    typeof candidate.profileId === "string" &&
    typeof candidate.environmentId === "string" &&
    typeof candidate.label === "string" &&
    (candidate.mode === "tailscale" || candidate.mode === "lan") &&
    typeof candidate.httpBaseUrl === "string" &&
    typeof candidate.wsBaseUrl === "string" &&
    (candidate.bearerToken === undefined || typeof candidate.bearerToken === "string") &&
    typeof candidate.sessionExpiresAt === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.lastConnectedAt === null || typeof candidate.lastConnectedAt === "string")
  );
}

function toPersistedProfile(profile: MobileConnectionProfile): PersistedMobileConnectionProfile {
  return {
    profileId: profile.profileId,
    environmentId: profile.environmentId,
    label: profile.label,
    mode: profile.mode,
    httpBaseUrl: profile.httpBaseUrl,
    wsBaseUrl: profile.wsBaseUrl,
    sessionExpiresAt: profile.sessionExpiresAt,
    createdAt: profile.createdAt,
    lastConnectedAt: profile.lastConnectedAt,
  };
}

async function persistProfiles(profiles: ReadonlyArray<MobileConnectionProfile>): Promise<void> {
  await writeStorageValue(
    JSON.stringify({
      version: 1,
      profiles: profiles.map(toPersistedProfile),
    } satisfies MobileProfileDocument),
  );
}

async function materializeProfile(
  profile: PersistedMobileConnectionProfile,
): Promise<MobileConnectionProfile | null> {
  const storedSecret = await readMobileProfileSecret(profile.profileId);
  const bearerToken = storedSecret ?? profile.bearerToken ?? "";
  if (!bearerToken) {
    return null;
  }

  if (profile.bearerToken && !storedSecret) {
    await writeMobileProfileSecret(profile.profileId, profile.bearerToken);
  }

  return {
    profileId: profile.profileId,
    environmentId: profile.environmentId,
    label: profile.label,
    mode: profile.mode,
    httpBaseUrl: profile.httpBaseUrl,
    wsBaseUrl: profile.wsBaseUrl,
    bearerToken,
    sessionExpiresAt: profile.sessionExpiresAt,
    createdAt: profile.createdAt,
    lastConnectedAt: profile.lastConnectedAt,
  };
}

export const useMobileProfileStore = create<MobileProfileStore>((set, get) => ({
  hydrated: false,
  profiles: [],
  hydrate: async () => {
    if (get().hydrated) {
      return;
    }
    if (hydrationPromise) {
      return hydrationPromise;
    }

    hydrationPromise = readStorageValue()
      .then(async (raw) => {
        const profiles = (
          await Promise.all(parseProfileDocument(raw).profiles.map(materializeProfile))
        ).filter((profile): profile is MobileConnectionProfile => profile !== null);
        set({
          hydrated: true,
          profiles,
        });
        await persistProfiles(profiles);
      })
      .finally(() => {
        hydrationPromise = null;
      });
    return hydrationPromise;
  },
  upsert: async (profile) => {
    await writeMobileProfileSecret(profile.profileId, profile.bearerToken);
    const profiles = [
      profile,
      ...get().profiles.filter((entry) => entry.profileId !== profile.profileId),
    ].toSorted((left, right) => left.label.localeCompare(right.label));
    set({ profiles });
    await persistProfiles(profiles);
  },
  remove: async (profileId) => {
    await removeMobileProfileSecret(profileId);
    const profiles = get().profiles.filter((entry) => entry.profileId !== profileId);
    set({ profiles });
    await persistProfiles(profiles);
  },
  markConnected: async (profileId, connectedAt) => {
    const profiles = get().profiles.map((profile) => {
      if (profile.profileId !== profileId) {
        return profile;
      }
      return {
        profileId: profile.profileId,
        environmentId: profile.environmentId,
        label: profile.label,
        mode: profile.mode,
        httpBaseUrl: profile.httpBaseUrl,
        wsBaseUrl: profile.wsBaseUrl,
        bearerToken: profile.bearerToken,
        sessionExpiresAt: profile.sessionExpiresAt,
        createdAt: profile.createdAt,
        lastConnectedAt: connectedAt,
      };
    });
    set({ profiles });
    await persistProfiles(profiles);
  },
}));

export function listMobileProfiles(): ReadonlyArray<MobileConnectionProfile> {
  return useMobileProfileStore.getState().profiles;
}

export function getMobileProfile(profileId: string): MobileConnectionProfile | null {
  return listMobileProfiles().find((profile) => profile.profileId === profileId) ?? null;
}

export function getMobileProfileByEnvironmentId(
  environmentId: EnvironmentId,
): MobileConnectionProfile | null {
  return listMobileProfiles().find((profile) => profile.environmentId === environmentId) ?? null;
}

export function createMobileProfileId(mode: MobileConnectionMode): string {
  return `${mode}-${randomUUID()}`;
}
