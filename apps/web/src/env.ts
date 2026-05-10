export function isElectronUserAgent(userAgent: string): boolean {
  return /\bElectron\/\d/i.test(userAgent);
}

function hasElectronBridge(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.desktopBridge !== undefined || window.nativeApi !== undefined)
  );
}

function hasElectronUserAgent(): boolean {
  return typeof navigator !== "undefined" && isElectronUserAgent(navigator.userAgent);
}

/**
 * True when running inside the Electron shell, false in a regular browser.
 * Prefer the preload bridge, but keep the Electron user agent as a fallback
 * because this flag controls layout before the app can recover from bridge
 * timing or preload failures.
 */
export const isElectron = hasElectronBridge() || hasElectronUserAgent();
