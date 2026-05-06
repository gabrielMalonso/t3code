import type { EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";

import type { MobileConnectionMode } from "./pairingTarget";

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
  readonly profiles: ReadonlyArray<MobileConnectionProfile>;
}

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
      profiles: parsed.profiles.filter(isMobileConnectionProfile),
    };
  } catch {
    return { version: 1, profiles: [] };
  }
}

function isMobileConnectionProfile(value: unknown): value is MobileConnectionProfile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MobileConnectionProfile>;
  return (
    typeof candidate.profileId === "string" &&
    typeof candidate.environmentId === "string" &&
    typeof candidate.label === "string" &&
    (candidate.mode === "tailscale" || candidate.mode === "lan") &&
    typeof candidate.httpBaseUrl === "string" &&
    typeof candidate.wsBaseUrl === "string" &&
    typeof candidate.bearerToken === "string" &&
    typeof candidate.sessionExpiresAt === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.lastConnectedAt === null || typeof candidate.lastConnectedAt === "string")
  );
}

async function persistProfiles(profiles: ReadonlyArray<MobileConnectionProfile>): Promise<void> {
  await writeStorageValue(JSON.stringify({ version: 1, profiles } satisfies MobileProfileDocument));
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
      .then((raw) => {
        set({
          hydrated: true,
          profiles: parseProfileDocument(raw).profiles,
        });
      })
      .finally(() => {
        hydrationPromise = null;
      });
    return hydrationPromise;
  },
  upsert: async (profile) => {
    const profiles = [
      profile,
      ...get().profiles.filter((entry) => entry.profileId !== profile.profileId),
    ].toSorted((left, right) => left.label.localeCompare(right.label));
    set({ profiles });
    await persistProfiles(profiles);
  },
  remove: async (profileId) => {
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
  return `${mode}-${crypto.randomUUID()}`;
}
