import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMobileProfileStore, type MobileConnectionProfile } from "./profileStorage";

const preferenceStore = vi.hoisted(() => new Map<string, string>());
const secureStore = vi.hoisted(() => new Map<string, string>());
const secureSetItem = vi.hoisted(() =>
  vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
);

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferenceStore.get(key) ?? null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferenceStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferenceStore.delete(key);
    }),
  },
}));

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: {
    getItem: vi.fn(async (key: string) => secureStore.get(key) ?? null),
    setItem: secureSetItem,
    removeItem: vi.fn(async (key: string) => {
      secureStore.delete(key);
    }),
  },
}));

const MOBILE_PROFILE_STORAGE_KEY = "t3code:mobile-profiles:v1";

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

function persistedProfiles() {
  return JSON.parse(preferenceStore.get(MOBILE_PROFILE_STORAGE_KEY) ?? "{}") as {
    profiles?: Array<Record<string, unknown>>;
  };
}

describe("mobile profile storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferenceStore.clear();
    secureStore.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: vi.fn((key: string) => preferenceStore.get(key) ?? null),
          setItem: vi.fn((key: string, value: string) => {
            preferenceStore.set(key, value);
          }),
          removeItem: vi.fn((key: string) => {
            preferenceStore.delete(key);
          }),
        },
      },
    });
    useMobileProfileStore.setState({
      hydrated: false,
      profiles: [],
    });
  });

  afterEach(() => {
    useMobileProfileStore.setState({
      hydrated: false,
      profiles: [],
    });
  });

  it("persists bearer tokens in secure storage instead of the profile document", async () => {
    const profile = makeProfile();

    await useMobileProfileStore.getState().upsert(profile);

    expect(secureSetItem).toHaveBeenCalledWith(
      expect.stringContaining(profile.profileId),
      profile.bearerToken,
    );
    expect(persistedProfiles().profiles?.[0]).not.toHaveProperty("bearerToken");
  });

  it("migrates legacy profile bearer tokens into secure storage on hydrate", async () => {
    const profile = makeProfile({ bearerToken: "legacy-token" });
    preferenceStore.set(
      MOBILE_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        profiles: [profile],
      }),
    );

    await useMobileProfileStore.getState().hydrate();

    expect(useMobileProfileStore.getState().profiles[0]?.bearerToken).toBe("legacy-token");
    expect(secureSetItem).toHaveBeenCalledWith(
      expect.stringContaining(profile.profileId),
      "legacy-token",
    );
    expect(persistedProfiles().profiles?.[0]).not.toHaveProperty("bearerToken");
  });
});
