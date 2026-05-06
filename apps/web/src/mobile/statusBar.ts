import { isNativeAndroidCapacitorRuntime } from "./platform";

type StatusBarTheme = "light" | "dark";

let currentStatusBarTheme: StatusBarTheme | null = null;
let syncGeneration = 0;

export function syncMobileStatusBarTheme(theme: StatusBarTheme): void {
  if (!isNativeAndroidCapacitorRuntime() || currentStatusBarTheme === theme) {
    return;
  }

  const generation = ++syncGeneration;
  void import("@capacitor/status-bar")
    .then(async ({ StatusBar, Style }) => {
      if (generation !== syncGeneration) return;
      await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
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
