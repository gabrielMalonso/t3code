/// <reference types="@capacitor-community/safe-area" />

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
    SystemBars: {
      insetsHandling: "disable",
    },
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
