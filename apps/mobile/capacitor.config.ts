/// <reference types="@capacitor-community/safe-area" />
/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from "@capacitor/cli";

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
    },
    StatusBar: {
      style: "DARK",
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
