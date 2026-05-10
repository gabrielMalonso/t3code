import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

contextBridge.exposeInMainWorld("desktopPetOverlay", {
  close: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_CLOSE_CHANNEL),
  dragStart: (input: unknown) =>
    ipcRenderer.invoke(IpcChannels.PET_OVERLAY_DRAG_START_CHANNEL, input),
  dragMove: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_DRAG_MOVE_CHANNEL),
  dragEnd: () => ipcRenderer.invoke(IpcChannels.PET_OVERLAY_DRAG_END_CHANNEL),
  setPointerInteraction: (input: unknown) =>
    ipcRenderer.invoke(IpcChannels.PET_OVERLAY_POINTER_INTERACTION_CHANNEL, input),
});
