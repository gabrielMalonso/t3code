const MOBILE_PROFILE_SECRET_KEY_PREFIX = "t3code:mobile-profile-secret:v1:";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function secretKey(profileId: string): string {
  return `${MOBILE_PROFILE_SECRET_KEY_PREFIX}${profileId}`;
}

async function isNativeCapacitorRuntime(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function readFallbackValue(key: string): Promise<string | null> {
  if (!hasWindow()) {
    return null;
  }

  try {
    const { Preferences } = await import("@capacitor/preferences");
    const result = await Preferences.get({ key });
    return result.value;
  } catch {
    return window.localStorage.getItem(key);
  }
}

async function writeFallbackValue(key: string, value: string): Promise<void> {
  if (!hasWindow()) {
    return;
  }

  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch {
    window.localStorage.setItem(key, value);
  }
}

async function removeFallbackValue(key: string): Promise<void> {
  if (!hasWindow()) {
    return;
  }

  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  } catch {
    window.localStorage.removeItem(key);
  }
}

async function readSecureStorageValue(key: string): Promise<string | null> {
  const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
  return SecureStorage.getItem(key);
}

async function writeSecureStorageValue(key: string, value: string): Promise<void> {
  const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
  await SecureStorage.setItem(key, value);
}

async function removeSecureStorageValue(key: string): Promise<void> {
  const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
  await SecureStorage.removeItem(key);
}

export async function readMobileProfileSecret(profileId: string): Promise<string | null> {
  const key = secretKey(profileId);
  try {
    return await readSecureStorageValue(key);
  } catch (error) {
    if (await isNativeCapacitorRuntime()) {
      throw error;
    }
    return readFallbackValue(key);
  }
}

export async function writeMobileProfileSecret(profileId: string, secret: string): Promise<void> {
  const key = secretKey(profileId);
  try {
    await writeSecureStorageValue(key, secret);
  } catch (error) {
    if (await isNativeCapacitorRuntime()) {
      throw error;
    }
    await writeFallbackValue(key, secret);
  }
}

export async function removeMobileProfileSecret(profileId: string): Promise<void> {
  const key = secretKey(profileId);
  try {
    await removeSecureStorageValue(key);
  } catch (error) {
    if (await isNativeCapacitorRuntime()) {
      throw error;
    }
    await removeFallbackValue(key);
  }
}
