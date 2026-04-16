import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DESKTOP_SETTINGS,
  readDesktopSettings,
  resolveDefaultDesktopSettings,
  resolveDefaultDesktopUpdateChannel,
  setDesktopServerExposurePreference,
  setDesktopUpdateChannelPreference,
  writeDesktopSettings,
} from "./desktopSettings";

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

describe("desktopSettings", () => {
  it("returns defaults when no settings file exists", () => {
    expect(readDesktopSettings(makeSettingsPath())).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("derives nightly defaults from nightly app versions", () => {
    expect(resolveDefaultDesktopUpdateChannel("0.0.17-nightly.20260415.45")).toBe("nightly");
    expect(resolveDefaultDesktopSettings("0.0.17-nightly.20260415.45")).toEqual({
      serverExposureMode: "local-only",
      updateChannel: "nightly",
    });
  });

  it("persists and reloads the configured server exposure mode", () => {
    const settingsPath = makeSettingsPath();

    writeDesktopSettings(settingsPath, {
      serverExposureMode: "network-accessible",
      updateChannel: "latest",
    });

    expect(readDesktopSettings(settingsPath)).toEqual({
      serverExposureMode: "network-accessible",
      updateChannel: "latest",
    });
  });

  it("preserves the requested network-accessible preference across temporary fallback", () => {
    expect(
      setDesktopServerExposurePreference(
        {
          serverExposureMode: "local-only",
          updateChannel: "latest",
        },
        "network-accessible",
      ),
    ).toEqual({
      serverExposureMode: "network-accessible",
      updateChannel: "latest",
    });
  });

  it("persists the requested nightly update channel", () => {
    expect(
      setDesktopUpdateChannelPreference(
        {
          serverExposureMode: "local-only",
          updateChannel: "latest",
        },
        "nightly",
      ),
    ).toEqual({
      serverExposureMode: "local-only",
      updateChannel: "nightly",
    });
  });

  it("falls back to defaults when the settings file is malformed", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(settingsPath, "{not-json", "utf8");

    expect(readDesktopSettings(settingsPath)).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("uses the provided build defaults when no settings file exists", () => {
    expect(
      readDesktopSettings(
        makeSettingsPath(),
        resolveDefaultDesktopSettings("0.0.17-nightly.20260415.45"),
      ),
    ).toEqual({
      serverExposureMode: "local-only",
      updateChannel: "nightly",
    });
  });
});
