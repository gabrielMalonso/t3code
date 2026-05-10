import { contextBridge, ipcRenderer } from "electron";

import {
  PET_OVERLAY_CLOSE_CHANNEL,
  PET_OVERLAY_DRAG_END_CHANNEL,
  PET_OVERLAY_DRAG_MOVE_CHANNEL,
  PET_OVERLAY_DRAG_START_CHANNEL,
  PET_OVERLAY_POINTER_INTERACTION_CHANNEL,
} from "./petOverlay.ts";

contextBridge.exposeInMainWorld("desktopPetOverlay", {
  close: () => ipcRenderer.invoke(PET_OVERLAY_CLOSE_CHANNEL),
  dragStart: (input: unknown) => ipcRenderer.invoke(PET_OVERLAY_DRAG_START_CHANNEL, input),
  dragMove: () => ipcRenderer.invoke(PET_OVERLAY_DRAG_MOVE_CHANNEL),
  dragEnd: () => ipcRenderer.invoke(PET_OVERLAY_DRAG_END_CHANNEL),
  setPointerInteraction: (input: unknown) =>
    ipcRenderer.invoke(PET_OVERLAY_POINTER_INTERACTION_CHANNEL, input),
});
