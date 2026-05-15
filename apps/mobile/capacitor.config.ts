import type { CapacitorConfig } from "@capacitor/cli";
import { SystemBarsStyle } from "@capacitor-community/safe-area";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "tools.t3code.mobile",
  appName: "T3 Code",
  webDir: "../web/dist",
  loggingBehavior: "none",
  server: {
    cleartext: true,
    androidScheme: "http",
  },
  plugins: {
    SafeArea: {
      initialViewportFitCover: true,
      statusBarStyle: SystemBarsStyle.Dark,
    },
    SystemBars: {
      insetsHandling: "disable",
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
      style: KeyboardStyle.Dark,
    },
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
