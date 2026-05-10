import type { DesktopPetOverlaySettings, DesktopPetOverlayState } from "@t3tools/contracts";

import type { DesktopPetActivityState, DesktopPetAnimation } from "./desktopPetActivity";

export const DESKTOP_PET_ID = "nimbus";
export const DESKTOP_PET_DISPLAY_NAME = "Nimbus";
export const DESKTOP_PET_DESCRIPTION =
  "A tiny chibi martial-arts kid riding a golden cloud companion.";
export const DESKTOP_PET_COLUMNS = 8;
export const DESKTOP_PET_ROWS = 9;
export const DESKTOP_PET_RENDER_WIDTH = 96;
export const DESKTOP_PET_RENDER_HEIGHT = 104;

export const DESKTOP_PET_STATE_ROWS = {
  idle: { row: 0, frames: 1, durationMs: 180 },
  runningRight: { row: 1, frames: 8, durationMs: 120 },
  runningLeft: { row: 2, frames: 8, durationMs: 120 },
  waving: { row: 3, frames: 4, durationMs: 150 },
  jumping: { row: 4, frames: 5, durationMs: 140 },
  failed: { row: 5, frames: 8, durationMs: 150 },
  waiting: { row: 6, frames: 6, durationMs: 170 },
  running: { row: 7, frames: 6, durationMs: 130 },
  review: { row: 8, frames: 6, durationMs: 155 },
} satisfies Record<DesktopPetAnimation, { row: number; frames: number; durationMs: number }>;

export function defaultDesktopPetPosition(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: 80, y: 80 };
  }
  return {
    x: Math.max(0, Math.round(window.screenX + window.innerWidth - DESKTOP_PET_RENDER_WIDTH - 32)),
    y: Math.max(
      0,
      Math.round(window.screenY + window.innerHeight - DESKTOP_PET_RENDER_HEIGHT - 48),
    ),
  };
}

export function buildDesktopPetOverlayState(input: {
  readonly activityState: DesktopPetActivityState;
  readonly settings: DesktopPetOverlaySettings;
  readonly position: { x: number; y: number } | null;
  readonly reducedMotion: boolean;
}): DesktopPetOverlayState {
  const animation = input.activityState.animation;
  const animationSpec = DESKTOP_PET_STATE_ROWS[animation];
  const position = input.position ?? input.settings.position ?? defaultDesktopPetPosition();

  return {
    visible: input.settings.enabled,
    petId: DESKTOP_PET_ID,
    displayName: DESKTOP_PET_DISPLAY_NAME,
    description: DESKTOP_PET_DESCRIPTION,
    animation,
    activity: input.activityState.activity,
    row: animationSpec.row,
    frames: animationSpec.frames,
    durationMs: input.reducedMotion ? 0 : animationSpec.durationMs,
    width: DESKTOP_PET_RENDER_WIDTH,
    height: DESKTOP_PET_RENDER_HEIGHT,
    columns: DESKTOP_PET_COLUMNS,
    rows: DESKTOP_PET_ROWS,
    x: position.x,
    y: position.y,
  };
}
