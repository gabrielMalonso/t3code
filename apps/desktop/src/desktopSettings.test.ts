import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DESKTOP_SETTINGS,
  readDesktopSettings,
  resolveDefaultDesktopSettings,
  setDesktopPetOverlaySettings,
  setDesktopServerExposurePreference,
  setDesktopTailscaleServePreference,
  setDesktopUpdateChannelPreference,
  writeDesktopSettings,
} from "./desktopSettings.ts";
import { resolveDefaultDesktopUpdateChannel } from "./updateChannels.ts";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeSettingsPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t3-desktop-settings-test-"));
  tempDirectories.push(directory);
  return path.join(directory, "desktop-settings.json");
}

const petOverlay = DEFAULT_DESKTOP_SETTINGS.petOverlay;

describe("desktopSettings", () => {
  it("returns defaults when no settings file exists", () => {
    expect(readDesktopSettings(makeSettingsPath(), "0.0.17")).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("defaults packaged nightly builds to the nightly update channel", () => {
    expect(resolveDefaultDesktopSettings("0.0.17-nightly.20260415.1")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("derives nightly defaults from nightly app versions", () => {
    expect(resolveDefaultDesktopUpdateChannel("0.0.17-nightly.20260415.45")).toBe("nightly");
    expect(resolveDefaultDesktopSettings("0.0.17-nightly.20260415.45")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("persists and reloads the configured server exposure mode", () => {
    const settingsPath = makeSettingsPath();

    writeDesktopSettings(settingsPath, {
      serverExposureMode: "network-accessible",
      tailscaleServeEnabled: true,
      tailscaleServePort: 8443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: true,
      petOverlay,
    });

    expect(readDesktopSettings(settingsPath, "0.0.17")).toEqual({
      serverExposureMode: "network-accessible",
      tailscaleServeEnabled: true,
      tailscaleServePort: 8443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: true,
      petOverlay,
    });
  });

  it("preserves the requested network-accessible preference across temporary fallback", () => {
    expect(
      setDesktopServerExposurePreference(
        {
          serverExposureMode: "local-only",
          tailscaleServeEnabled: false,
          tailscaleServePort: 443,
          updateChannel: "latest",
          updateChannelConfiguredByUser: false,
          petOverlay,
        },
        "network-accessible",
      ),
    ).toEqual({
      serverExposureMode: "network-accessible",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("persists the requested Tailscale Serve preference", () => {
    expect(
      setDesktopTailscaleServePreference(
        {
          serverExposureMode: "local-only",
          tailscaleServeEnabled: false,
          tailscaleServePort: 443,
          updateChannel: "latest",
          updateChannelConfiguredByUser: false,
          petOverlay,
        },
        { enabled: true, port: 8443 },
      ),
    ).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: true,
      tailscaleServePort: 8443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("preserves the configured Tailscale Serve port when no new port is requested", () => {
    expect(
      setDesktopTailscaleServePreference(
        {
          serverExposureMode: "local-only",
          tailscaleServeEnabled: false,
          tailscaleServePort: 8443,
          updateChannel: "latest",
          updateChannelConfiguredByUser: false,
          petOverlay,
        },
        { enabled: true },
      ),
    ).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: true,
      tailscaleServePort: 8443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("persists the requested nightly update channel", () => {
    expect(
      setDesktopUpdateChannelPreference(
        {
          serverExposureMode: "local-only",
          tailscaleServeEnabled: false,
          tailscaleServePort: 443,
          updateChannel: "latest",
          updateChannelConfiguredByUser: false,
          petOverlay,
        },
        "nightly",
      ),
    ).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "nightly",
      updateChannelConfiguredByUser: true,
      petOverlay,
    });
  });

  it("falls back to defaults when the settings file is malformed", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(settingsPath, "{not-json", "utf8");

    expect(readDesktopSettings(settingsPath, "0.0.17")).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("falls back to the nightly channel for legacy nightly settings without an update track", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify({ serverExposureMode: "local-only" }), "utf8");

    expect(readDesktopSettings(settingsPath, "0.0.17-nightly.20260415.1")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("migrates legacy implicit stable settings to nightly when running a nightly build", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        serverExposureMode: "local-only",
        updateChannel: "latest",
      }),
      "utf8",
    );

    expect(readDesktopSettings(settingsPath, "0.0.17-nightly.20260415.1")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("preserves an explicit stable choice on nightly builds", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        serverExposureMode: "local-only",
        updateChannel: "latest",
        updateChannelConfiguredByUser: true,
      }),
      "utf8",
    );

    expect(readDesktopSettings(settingsPath, "0.0.17-nightly.20260415.1")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: true,
      petOverlay,
    });
  });

  it("uses the provided build defaults when no settings file exists", () => {
    expect(readDesktopSettings(makeSettingsPath(), "0.0.17-nightly.20260415.45")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("falls back to the default Tailscale Serve port when the persisted port is invalid", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        tailscaleServeEnabled: true,
        tailscaleServePort: 0,
      }),
      "utf8",
    );

    expect(readDesktopSettings(settingsPath, "0.0.17")).toEqual({
      serverExposureMode: "local-only",
      tailscaleServeEnabled: true,
      tailscaleServePort: 443,
      updateChannel: "latest",
      updateChannelConfiguredByUser: false,
      petOverlay,
    });
  });

  it("persists pet overlay settings", () => {
    const settings = setDesktopPetOverlaySettings(DEFAULT_DESKTOP_SETTINGS, {
      enabled: true,
      position: { x: 123.4, y: 456.6 },
    });

    expect(settings.petOverlay).toEqual({
      enabled: true,
      position: { x: 123.4, y: 456.6 },
    });
  });

  it("normalizes invalid persisted pet overlay settings", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        petOverlay: {
          enabled: true,
          position: { x: "bad", y: 10 },
        },
      }),
      "utf8",
    );

    expect(readDesktopSettings(settingsPath, "0.0.17").petOverlay).toEqual({
      enabled: true,
      position: null,
    });
  });
});
