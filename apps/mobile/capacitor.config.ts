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
    StatusBar: {
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
    },
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
