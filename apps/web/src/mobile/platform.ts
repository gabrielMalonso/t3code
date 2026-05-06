type CapacitorGlobal = {
  readonly isNativePlatform?: () => boolean;
  readonly getPlatform?: () => string;
};

function readCapacitorGlobal(): CapacitorGlobal | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return candidate && typeof candidate === "object" ? candidate : null;
}

export function isMobileCapacitorRuntime(): boolean {
  const capacitor = readCapacitorGlobal();
  if (capacitor?.isNativePlatform?.() === true) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const search = new URLSearchParams(window.location.search);
  return search.get("mobile") === "1" || window.localStorage.getItem("t3code:mobile-dev") === "1";
}

export function getMobilePlatformLabel(): string {
  return readCapacitorGlobal()?.getPlatform?.() ?? "web";
}

export function isNativeAndroidCapacitorRuntime(): boolean {
  const capacitor = readCapacitorGlobal();
  return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === "android";
}
