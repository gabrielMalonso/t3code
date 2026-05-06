import type { CapacitorConfig } from "@capacitor/cli";
import { SystemBarsStyle } from "@capacitor-community/safe-area";

const config: CapacitorConfig = {
  appId: "tools.t3code.mobile",
  appName: "T3 Code",
  webDir: "../web/dist",
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
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
