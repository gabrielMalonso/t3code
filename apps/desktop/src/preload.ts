import type { DesktopBridge } from "@t3tools/contracts";
import { contextBridge, ipcRenderer, webUtils } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

function unwrapEnsureSshEnvironmentResult(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    result.type === IpcChannels.SSH_PASSWORD_PROMPT_CANCELLED_RESULT
  ) {
    const message =
      "message" in result && typeof result.message === "string"
        ? result.message
        : "SSH authentication cancelled.";
    throw new Error(message);
  }
  return result as Awaited<ReturnType<DesktopBridge["ensureSshEnvironment"]>>;
}

contextBridge.exposeInMainWorld("desktopBridge", {
  getAppBranding: () => {
    const result = ipcRenderer.sendSync(IpcChannels.GET_APP_BRANDING_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getAppBranding"]>;
  },
  getLocalEnvironmentBootstrap: () => {
    const result = ipcRenderer.sendSync(IpcChannels.GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getLocalEnvironmentBootstrap"]>;
  },
  getClientSettings: () => ipcRenderer.invoke(IpcChannels.GET_CLIENT_SETTINGS_CHANNEL),
  setClientSettings: (settings) =>
    ipcRenderer.invoke(IpcChannels.SET_CLIENT_SETTINGS_CHANNEL, settings),
  getSavedEnvironmentRegistry: () =>
    ipcRenderer.invoke(IpcChannels.GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL),
  setSavedEnvironmentRegistry: (records) =>
    ipcRenderer.invoke(IpcChannels.SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, records),
  getSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(IpcChannels.GET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  setSavedEnvironmentSecret: (environmentId, secret) =>
    ipcRenderer.invoke(IpcChannels.SET_SAVED_ENVIRONMENT_SECRET_CHANNEL, { environmentId, secret }),
  removeSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(IpcChannels.REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  discoverSshHosts: () => ipcRenderer.invoke(IpcChannels.DISCOVER_SSH_HOSTS_CHANNEL),
  ensureSshEnvironment: async (target, options) =>
    unwrapEnsureSshEnvironmentResult(
      await ipcRenderer.invoke(IpcChannels.ENSURE_SSH_ENVIRONMENT_CHANNEL, {
        target,
        ...(options === undefined ? {} : { options }),
      }),
    ),
  disconnectSshEnvironment: (target) =>
    ipcRenderer.invoke(IpcChannels.DISCONNECT_SSH_ENVIRONMENT_CHANNEL, target),
  fetchSshEnvironmentDescriptor: (httpBaseUrl) =>
    ipcRenderer.invoke(IpcChannels.FETCH_SSH_ENVIRONMENT_DESCRIPTOR_CHANNEL, { httpBaseUrl }),
  bootstrapSshBearerSession: (httpBaseUrl, credential) =>
    ipcRenderer.invoke(IpcChannels.BOOTSTRAP_SSH_BEARER_SESSION_CHANNEL, {
      httpBaseUrl,
      credential,
    }),
  fetchSshSessionState: (httpBaseUrl, bearerToken) =>
    ipcRenderer.invoke(IpcChannels.FETCH_SSH_SESSION_STATE_CHANNEL, { httpBaseUrl, bearerToken }),
  issueSshWebSocketToken: (httpBaseUrl, bearerToken) =>
    ipcRenderer.invoke(IpcChannels.ISSUE_SSH_WEBSOCKET_TOKEN_CHANNEL, { httpBaseUrl, bearerToken }),
  onSshPasswordPrompt: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, request: unknown) => {
      if (typeof request !== "object" || request === null) return;
      listener(request as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcChannels.SSH_PASSWORD_PROMPT_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.SSH_PASSWORD_PROMPT_CHANNEL, wrappedListener);
    };
  },
  resolveSshPasswordPrompt: (requestId, password) =>
    ipcRenderer.invoke(IpcChannels.RESOLVE_SSH_PASSWORD_PROMPT_CHANNEL, { requestId, password }),
  getServerExposureState: () => ipcRenderer.invoke(IpcChannels.GET_SERVER_EXPOSURE_STATE_CHANNEL),
  setServerExposureMode: (mode) =>
    ipcRenderer.invoke(IpcChannels.SET_SERVER_EXPOSURE_MODE_CHANNEL, mode),
  setTailscaleServeEnabled: (input) =>
    ipcRenderer.invoke(IpcChannels.SET_TAILSCALE_SERVE_ENABLED_CHANNEL, input),
  getAdvertisedEndpoints: () => ipcRenderer.invoke(IpcChannels.GET_ADVERTISED_ENDPOINTS_CHANNEL),
  pickFolder: (options) => ipcRenderer.invoke(IpcChannels.PICK_FOLDER_CHANNEL, options),
  getPathForFile: async (file) => {
    try {
      const filePath = webUtils.getPathForFile(file);
      return filePath.length > 0 ? filePath : null;
    } catch {
      return null;
    }
  },
  confirm: (message) => ipcRenderer.invoke(IpcChannels.CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(IpcChannels.SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) =>
    ipcRenderer.invoke(IpcChannels.CONTEXT_MENU_CHANNEL, {
      items,
      ...(position === undefined ? {} : { position }),
    }),
  openExternal: (url: string) => ipcRenderer.invoke(IpcChannels.OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(IpcChannels.MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  petOverlay: {
    getSettings: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_GET_SETTINGS_CHANNEL),
    setEnabled: (enabled) =>
      ipcRenderer.invoke(IpcChannels.PET_OVERLAY_SET_ENABLED_CHANNEL, enabled),
    setState: (state) => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_SET_STATE_CHANNEL, state),
    hide: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_HIDE_CHANNEL),
    close: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_CLOSE_CHANNEL),
    dragStart: (input) => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_DRAG_START_CHANNEL, input),
    dragMove: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_DRAG_MOVE_CHANNEL),
    dragEnd: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_DRAG_END_CHANNEL),
    setPointerInteraction: (input) =>
      ipcRenderer.invoke(IpcChannels.PET_OVERLAY_POINTER_INTERACTION_CHANNEL, input),
    onMoved: (listener) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, position: unknown) => {
        if (typeof position !== "object" || position === null) return;
        listener(position as Parameters<typeof listener>[0]);
      };

      ipcRenderer.on(IpcChannels.PET_OVERLAY_MOVED_CHANNEL, wrappedListener);
      return () => {
        ipcRenderer.removeListener(IpcChannels.PET_OVERLAY_MOVED_CHANNEL, wrappedListener);
      };
    },
    onSettingsChanged: (listener) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, settings: unknown) => {
        if (typeof settings !== "object" || settings === null) return;
        listener(settings as Parameters<typeof listener>[0]);
      };

      ipcRenderer.on(IpcChannels.PET_OVERLAY_SETTINGS_CHANGED_CHANNEL, wrappedListener);
      return () => {
        ipcRenderer.removeListener(
          IpcChannels.PET_OVERLAY_SETTINGS_CHANGED_CHANNEL,
          wrappedListener,
        );
      };
    },
  },
  getUpdateState: () => ipcRenderer.invoke(IpcChannels.UPDATE_GET_STATE_CHANNEL),
  setUpdateChannel: (channel) =>
    ipcRenderer.invoke(IpcChannels.UPDATE_SET_CHANNEL_CHANNEL, channel),
  checkForUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcChannels.UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
