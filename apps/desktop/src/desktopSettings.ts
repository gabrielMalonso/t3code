import * as FS from "node:fs";
import * as Path from "node:path";
import type {
  DesktopPetOverlaySettings,
  DesktopServerExposureMode,
  DesktopUpdateChannel,
} from "@t3tools/contracts";

import { resolveDefaultDesktopUpdateChannel } from "./updateChannels.ts";

export interface DesktopSettings {
  readonly serverExposureMode: DesktopServerExposureMode;
  readonly tailscaleServeEnabled: boolean;
  readonly tailscaleServePort: number;
  readonly updateChannel: DesktopUpdateChannel;
  readonly updateChannelConfiguredByUser: boolean;
  readonly petOverlay: DesktopPetOverlaySettings;
}

export const DEFAULT_TAILSCALE_SERVE_PORT = 443;

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  serverExposureMode: "local-only",
  tailscaleServeEnabled: false,
  tailscaleServePort: DEFAULT_TAILSCALE_SERVE_PORT,
  updateChannel: "latest",
  updateChannelConfiguredByUser: false,
  petOverlay: {
    enabled: false,
    position: null,
  },
};

export function resolveDefaultDesktopSettings(appVersion: string): DesktopSettings {
  return {
    ...DEFAULT_DESKTOP_SETTINGS,
    updateChannel: resolveDefaultDesktopUpdateChannel(appVersion),
  };
}

export function setDesktopServerExposurePreference(
  settings: DesktopSettings,
  requestedMode: DesktopServerExposureMode,
): DesktopSettings {
  return settings.serverExposureMode === requestedMode
    ? settings
    : {
        ...settings,
        serverExposureMode: requestedMode,
      };
}

export function setDesktopTailscaleServePreference(
  settings: DesktopSettings,
  input: { readonly enabled: boolean; readonly port?: number },
): DesktopSettings {
  const port =
    input.port === undefined
      ? settings.tailscaleServePort
      : normalizeTailscaleServePort(input.port);
  return settings.tailscaleServeEnabled === input.enabled && settings.tailscaleServePort === port
    ? settings
    : {
        ...settings,
        tailscaleServeEnabled: input.enabled,
        tailscaleServePort: port,
      };
}

export function normalizeTailscaleServePort(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535
    ? value
    : DEFAULT_TAILSCALE_SERVE_PORT;
}

export function setDesktopUpdateChannelPreference(
  settings: DesktopSettings,
  requestedChannel: DesktopUpdateChannel,
): DesktopSettings {
  return {
    ...settings,
    updateChannel: requestedChannel,
    updateChannelConfiguredByUser: true,
  };
}

function normalizePetOverlayPosition(value: unknown): DesktopPetOverlaySettings["position"] {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const position = value as { readonly x?: unknown; readonly y?: unknown };
  if (
    typeof position.x !== "number" ||
    typeof position.y !== "number" ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y)
  ) {
    return null;
  }
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };
}

export function normalizePetOverlaySettings(value: unknown): DesktopPetOverlaySettings {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_DESKTOP_SETTINGS.petOverlay;
  }
  const settings = value as {
    readonly enabled?: unknown;
    readonly position?: unknown;
  };
  return {
    enabled: settings.enabled === true,
    position: normalizePetOverlayPosition(settings.position),
  };
}

export function setDesktopPetOverlaySettings(
  settings: DesktopSettings,
  petOverlay: DesktopPetOverlaySettings,
): DesktopSettings {
  return settings.petOverlay.enabled === petOverlay.enabled &&
    settings.petOverlay.position?.x === petOverlay.position?.x &&
    settings.petOverlay.position?.y === petOverlay.position?.y
    ? settings
    : {
        ...settings,
        petOverlay,
      };
}

export function readDesktopSettings(settingsPath: string, appVersion: string): DesktopSettings {
  const defaultSettings = resolveDefaultDesktopSettings(appVersion);
  try {
    if (!FS.existsSync(settingsPath)) {
      return defaultSettings;
    }

    const raw = FS.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      readonly serverExposureMode?: unknown;
      readonly tailscaleServeEnabled?: unknown;
      readonly tailscaleServePort?: unknown;
      readonly updateChannel?: unknown;
      readonly updateChannelConfiguredByUser?: unknown;
      readonly petOverlay?: unknown;
    };
    const parsedUpdateChannel =
      parsed.updateChannel === "nightly" || parsed.updateChannel === "latest"
        ? parsed.updateChannel
        : null;
    const isLegacySettings = parsed.updateChannelConfiguredByUser === undefined;
    const updateChannelConfiguredByUser =
      parsed.updateChannelConfiguredByUser === true ||
      (isLegacySettings && parsedUpdateChannel === "nightly");

    return {
      serverExposureMode:
        parsed.serverExposureMode === "network-accessible" ? "network-accessible" : "local-only",
      tailscaleServeEnabled: parsed.tailscaleServeEnabled === true,
      tailscaleServePort: normalizeTailscaleServePort(parsed.tailscaleServePort),
      updateChannel:
        updateChannelConfiguredByUser && parsedUpdateChannel !== null
          ? parsedUpdateChannel
          : defaultSettings.updateChannel,
      updateChannelConfiguredByUser,
      petOverlay: normalizePetOverlaySettings(parsed.petOverlay),
    };
  } catch {
    return defaultSettings;
  }
}

export function writeDesktopSettings(settingsPath: string, settings: DesktopSettings): void {
  const directory = Path.dirname(settingsPath);
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  FS.mkdirSync(directory, { recursive: true });
  FS.writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, settingsPath);
}
