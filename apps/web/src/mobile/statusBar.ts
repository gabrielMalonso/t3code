import { isNativeAndroidCapacitorRuntime } from "./platform";

type StatusBarTheme = "light" | "dark";

let currentStatusBarTheme: StatusBarTheme | null = null;
let syncGeneration = 0;

export function syncMobileStatusBarTheme(theme: StatusBarTheme): void {
  if (!isNativeAndroidCapacitorRuntime() || currentStatusBarTheme === theme) {
    return;
  }

  const generation = ++syncGeneration;
  void import("@capacitor-community/safe-area")
    .then(async ({ SafeArea, SystemBarsStyle, SystemBarsType }) => {
      if (generation !== syncGeneration) return;
      await SafeArea.setSystemBarsStyle({
        style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
        type: SystemBarsType.StatusBar,
      });
      if (generation === syncGeneration) {
        currentStatusBarTheme = theme;
      }
    })
    .catch(() => {
      if (generation === syncGeneration) {
        currentStatusBarTheme = null;
      }
    });
}
