import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopPetOverlay from "../../petOverlay.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

const PetOverlaySettingsSchema = Schema.Struct({
  enabled: Schema.Boolean,
  position: Schema.NullOr(
    Schema.Struct({
      x: Schema.Number,
      y: Schema.Number,
    }),
  ),
});

export const getPetOverlaySettings = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_GET_SETTINGS_CHANNEL,
  payload: Schema.Void,
  result: PetOverlaySettingsSchema,
  handler: Effect.fn("desktop.ipc.petOverlay.getSettings")(function* () {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    return yield* petOverlay.getSettings;
  }),
});

export const setPetOverlayEnabled = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_SET_ENABLED_CHANNEL,
  payload: Schema.Boolean,
  result: PetOverlaySettingsSchema,
  handler: Effect.fn("desktop.ipc.petOverlay.setEnabled")(function* (enabled) {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    return yield* petOverlay.setEnabled(enabled);
  }),
});

export const setPetOverlayState = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_SET_STATE_CHANNEL,
  payload: Schema.Any,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.petOverlay.setState")(function* (state) {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    yield* petOverlay.setState(state);
  }),
});

export const hidePetOverlay = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_HIDE_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.petOverlay.hide")(function* () {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    yield* petOverlay.hide;
  }),
});

export const closePetOverlay = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_CLOSE_CHANNEL,
  payload: Schema.Void,
  result: PetOverlaySettingsSchema,
  handler: Effect.fn("desktop.ipc.petOverlay.close")(function* () {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    return yield* petOverlay.close;
  }),
});

export const startPetOverlayDrag = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_DRAG_START_CHANNEL,
  payload: Schema.Any,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.petOverlay.dragStart")(function* (input) {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    yield* petOverlay.dragStart(input);
  }),
});

export const movePetOverlayDrag = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_DRAG_MOVE_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.petOverlay.dragMove")(function* () {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    yield* petOverlay.dragMove;
  }),
});

export const endPetOverlayDrag = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_DRAG_END_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.petOverlay.dragEnd")(function* () {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    yield* petOverlay.dragEnd;
  }),
});

export const setPetOverlayPointerInteraction = makeIpcMethod({
  channel: IpcChannels.PET_OVERLAY_POINTER_INTERACTION_CHANNEL,
  payload: Schema.Any,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.petOverlay.pointerInteraction")(function* (input) {
    const petOverlay = yield* DesktopPetOverlay.DesktopPetOverlay;
    yield* petOverlay.setPointerInteraction(input);
  }),
});
