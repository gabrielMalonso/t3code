import { pathToFileURL } from "node:url";

import { BrowserWindow, screen } from "electron";
import type {
  DesktopPetOverlayDragStartInput,
  DesktopPetOverlayPointerInteractionInput,
  DesktopPetOverlayPosition,
  DesktopPetOverlayState,
} from "@t3tools/contracts";

export const PET_OVERLAY_SET_STATE_CHANNEL = "desktop:pet-overlay-set-state";
export const PET_OVERLAY_HIDE_CHANNEL = "desktop:pet-overlay-hide";
export const PET_OVERLAY_CLOSE_CHANNEL = "desktop:pet-overlay-close";
export const PET_OVERLAY_MOVED_CHANNEL = "desktop:pet-overlay-moved";
export const PET_OVERLAY_SETTINGS_CHANGED_CHANNEL = "desktop:pet-overlay-settings-changed";
export const PET_OVERLAY_GET_SETTINGS_CHANNEL = "desktop:pet-overlay-get-settings";
export const PET_OVERLAY_SET_ENABLED_CHANNEL = "desktop:pet-overlay-set-enabled";
export const PET_OVERLAY_DRAG_START_CHANNEL = "desktop:pet-overlay-drag-start";
export const PET_OVERLAY_DRAG_MOVE_CHANNEL = "desktop:pet-overlay-drag-move";
export const PET_OVERLAY_DRAG_END_CHANNEL = "desktop:pet-overlay-drag-end";
export const PET_OVERLAY_POINTER_INTERACTION_CHANNEL = "desktop:pet-overlay-pointer-interaction";

const MAX_PET_WINDOW_SIZE = 320;
const MIN_PET_WINDOW_SIZE = 16;
const PET_GROUND_PADDING = 8;
const SAFE_PET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

type ResolvePetAssetPath = (petId: string) => string | null;
type OnMoved = (position: DesktopPetOverlayPosition) => void;

interface OverlayDragState {
  pointerAnchorX: number;
  pointerAnchorY: number;
  hasMoved: boolean;
}

interface PetOverlayLayout {
  windowWidth: number;
  windowHeight: number;
  petLeft: number;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isSafePetId(petId: string): boolean {
  return SAFE_PET_ID_PATTERN.test(petId) && !petId.includes("..");
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteIntegerInRange(value: unknown, min: number, max: number): number | null {
  const number = finiteNumber(value);
  if (number === null) return null;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function resolveOverlayLayout(state: DesktopPetOverlayState): PetOverlayLayout {
  return {
    windowWidth: state.width,
    windowHeight: state.height + PET_GROUND_PADDING,
    petLeft: 0,
  };
}

function distanceFromWorkArea(position: DesktopPetOverlayPosition, workArea: DisplayWorkArea) {
  const dx =
    position.x < workArea.x
      ? workArea.x - position.x
      : position.x > workArea.x + workArea.width
        ? position.x - (workArea.x + workArea.width)
        : 0;
  const dy =
    position.y < workArea.y
      ? workArea.y - position.y
      : position.y > workArea.y + workArea.height
        ? position.y - (workArea.y + workArea.height)
        : 0;
  return Math.hypot(dx, dy);
}

export function clampPetOverlayPosition(input: {
  readonly position: DesktopPetOverlayPosition;
  readonly size: { width: number; height: number };
  readonly workAreas: readonly DisplayWorkArea[];
}): DesktopPetOverlayPosition {
  const workArea =
    input.workAreas
      .filter((candidate) => candidate.width > 0 && candidate.height > 0)
      .toSorted(
        (left, right) =>
          distanceFromWorkArea(input.position, left) - distanceFromWorkArea(input.position, right),
      )[0] ?? null;

  if (!workArea) {
    return {
      x: Math.round(input.position.x),
      y: Math.round(input.position.y),
    };
  }

  const maxX = workArea.x + Math.max(0, workArea.width - input.size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - input.size.height);
  return {
    x: Math.round(Math.min(maxX, Math.max(workArea.x, input.position.x))),
    y: Math.round(Math.min(maxY, Math.max(workArea.y, input.position.y))),
  };
}

export function normalizePetOverlayState(
  input: unknown,
  resolvePetAssetPath: ResolvePetAssetPath,
): (DesktopPetOverlayState & { assetUrl: string }) | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const rawState = input as Partial<DesktopPetOverlayState>;
  const petId = typeof rawState.petId === "string" ? rawState.petId : "";
  if (!isSafePetId(petId)) {
    return null;
  }

  const assetPath = resolvePetAssetPath(petId);
  if (!assetPath) {
    return null;
  }

  const displayName = typeof rawState.displayName === "string" ? rawState.displayName : "T3 pet";
  const description = typeof rawState.description === "string" ? rawState.description : "";
  const animation = typeof rawState.animation === "string" ? rawState.animation : "idle";
  const activity =
    typeof rawState.activity === "object" &&
    rawState.activity !== null &&
    (rawState.activity.kind === "input-needed" ||
      rawState.activity.kind === "working" ||
      rawState.activity.kind === "connecting") &&
    typeof rawState.activity.label === "string" &&
    typeof rawState.activity.title === "string"
      ? {
          kind: rawState.activity.kind,
          label: rawState.activity.label.slice(0, 80),
          title: rawState.activity.title.slice(0, 120),
        }
      : null;
  const width = finiteIntegerInRange(rawState.width, MIN_PET_WINDOW_SIZE, MAX_PET_WINDOW_SIZE);
  const height = finiteIntegerInRange(rawState.height, MIN_PET_WINDOW_SIZE, MAX_PET_WINDOW_SIZE);
  const columns = finiteIntegerInRange(rawState.columns, 1, 32);
  const rows = finiteIntegerInRange(rawState.rows, 1, 32);
  const row = finiteIntegerInRange(rawState.row, 0, 31);
  const frames = finiteIntegerInRange(rawState.frames, 1, 32);
  const durationMs = finiteIntegerInRange(rawState.durationMs, 0, 5_000);
  const x = finiteIntegerInRange(rawState.x, -100_000, 100_000);
  const y = finiteIntegerInRange(rawState.y, -100_000, 100_000);

  if (width === null || height === null || columns === null || rows === null) {
    return null;
  }
  if (
    row === null ||
    row >= rows ||
    frames === null ||
    durationMs === null ||
    x === null ||
    y === null
  ) {
    return null;
  }

  return {
    visible: rawState.visible === true,
    petId,
    displayName,
    description,
    animation,
    activity,
    row,
    frames: Math.min(frames, columns),
    durationMs,
    width,
    height,
    columns,
    rows,
    x,
    y,
    assetUrl: pathToFileURL(assetPath).toString(),
  };
}

function buildPetOverlayHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
    }
    #root {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    #pet {
      position: absolute;
      top: 0;
      left: var(--pet-left, 0px);
      width: var(--pet-width, 100vw);
      height: var(--pet-height, 100vh);
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      overflow: hidden;
      contain: layout paint style;
      filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.32));
      transition: transform 120ms ease;
    }
    #pet-strip {
      height: 100%;
      background-repeat: no-repeat;
      image-rendering: pixelated;
      transform: translate3d(0, 0, 0);
    }
    #pet-ground {
      position: absolute;
      left: calc(var(--pet-left, 0px) + var(--pet-width, 100vw) / 2);
      top: calc(var(--pet-height, 100vh) - 4px);
      width: calc(var(--pet-width, 100vw) * 0.7);
      height: 10px;
      transform: translateX(-50%);
      border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.32) 38%, rgba(0, 0, 0, 0) 72%);
      pointer-events: none;
      filter: blur(0.5px);
    }
    #pet.dragging {
      cursor: grabbing;
      transform: scale(1.03);
    }
    #pet.tap {
      transform: translateY(-8px);
    }
    #pet.has-activity {
      animation: pet-activity-pulse 1800ms ease-in-out infinite;
    }
    #pet.has-activity[data-activity-kind="input-needed"] {
      animation-duration: 1100ms;
      animation-name: pet-activity-pulse-alert;
    }
    @keyframes pet-activity-pulse {
      0%, 100% { filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.32)); }
      50% { filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.32)) drop-shadow(0 0 10px rgba(56, 189, 248, 0.55)); }
    }
    @keyframes pet-activity-pulse-alert {
      0%, 100% { filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.32)); }
      50% { filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.32)) drop-shadow(0 0 12px rgba(245, 158, 11, 0.7)); }
    }
    #pet-strip.animating {
      animation: pet-sprite-steps var(--pet-duration) steps(var(--pet-frames)) var(--pet-iterations);
      animation-fill-mode: var(--pet-fill-mode, none);
      will-change: transform;
    }
    @keyframes pet-sprite-steps {
      from { transform: translate3d(0, 0, 0); }
      to { transform: translate3d(var(--pet-sprite-x-end), 0, 0); }
    }
  </style>
</head>
<body>
  <div id="root">
    <div id="pet" role="img" aria-label="T3 pet"><div id="pet-strip"></div></div>
    <div id="pet-ground" aria-hidden="true"></div>
  </div>
  <script>
    const root = document.getElementById("root");
    const pet = document.getElementById("pet");
    const strip = document.getElementById("pet-strip");
    let state = null;
    let drag = null;
    let tapTimeout = 0;
    let animationKey = "";
    let dragFrame = 0;
    let pointerInteractive = true;

    function isLoopingAnimation(animation) {
      return animation !== "jumping" && animation !== "waving";
    }

    function flushDragMove() {
      dragFrame = 0;
      window.desktopPetOverlay?.dragMove();
    }

    function setPointerInteractive(nextInteractive) {
      if (pointerInteractive === nextInteractive) return;
      pointerInteractive = nextInteractive;
      window.desktopPetOverlay?.setPointerInteraction({ interactive: nextInteractive });
    }

    function isInsidePet(event) {
      const bounds = root.getBoundingClientRect();
      return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    }

    async function closePet(event) {
      event.preventDefault();
      event.stopPropagation();
      await window.desktopPetOverlay?.close();
    }

    function render() {
      if (!state) return;
      pet.setAttribute("aria-label", state.displayName + ": " + state.description);
      pet.title = state.displayName;
      pet.dataset.petAnimation = state.animation;
      root.style.setProperty("--pet-width", state.width + "px");
      root.style.setProperty("--pet-height", state.height + "px");
      root.style.setProperty("--pet-left", "0px");
      const hasActivity = state.activity != null;
      pet.classList.toggle("has-activity", hasActivity);
      if (hasActivity) {
        pet.dataset.activityKind = state.activity.kind;
      } else {
        pet.removeAttribute("data-activity-kind");
      }
      const loops = isLoopingAnimation(state.animation);
      const steps = loops ? state.frames : Math.max(1, state.frames - 1);
      strip.style.width = (state.width * state.columns) + "px";
      strip.style.backgroundImage = "url(" + JSON.stringify(state.assetUrl) + ")";
      strip.style.backgroundSize = (state.width * state.columns) + "px " + (state.height * state.rows) + "px";
      strip.style.backgroundPosition = "0px " + (-state.row * state.height) + "px";
      strip.style.setProperty("--pet-duration", (state.frames * state.durationMs) + "ms");
      strip.style.setProperty("--pet-frames", String(steps));
      strip.style.setProperty("--pet-iterations", loops ? "infinite" : "1");
      strip.style.setProperty("--pet-fill-mode", loops ? "none" : "forwards");
      strip.style.setProperty("--pet-sprite-x-end", (-(loops ? state.frames : state.frames - 1) * state.width) + "px");

      const nextAnimationKey = [state.animation, state.row, state.frames, state.durationMs, state.width].join(":");
      if (nextAnimationKey === animationKey) return;
      animationKey = nextAnimationKey;
      strip.classList.remove("animating");
      if (state.durationMs <= 0 || state.frames <= 1) {
        strip.style.removeProperty("will-change");
        return;
      }
      void strip.offsetWidth;
      strip.classList.add("animating");
    }

    window.__setPetOverlayState = (nextState) => {
      state = nextState;
      render();
    };

    pet.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      setPointerInteractive(true);
      drag = {
        screenX: event.screenX,
        screenY: event.screenY,
        moved: 0,
      };
      pet.classList.add("dragging");
      pet.setPointerCapture(event.pointerId);
      window.desktopPetOverlay?.dragStart({
        pointerWindowX: event.clientX,
        pointerWindowY: event.clientY,
      });
    });

    pet.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = Math.round(event.screenX - drag.screenX);
      const dy = Math.round(event.screenY - drag.screenY);
      if (dx === 0 && dy === 0) return;
      drag.screenX = event.screenX;
      drag.screenY = event.screenY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4 && !dragFrame) {
        dragFrame = window.requestAnimationFrame(flushDragMove);
      }
    });

    function finishPointer() {
      if (!drag) return;
      const wasTap = drag.moved <= 8;
      drag = null;
      pet.classList.remove("dragging");
      if (dragFrame) {
        window.cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        window.desktopPetOverlay?.dragMove();
      }
      window.desktopPetOverlay?.dragEnd();
      if (!wasTap) return;
      window.clearTimeout(tapTimeout);
      pet.classList.add("tap");
      tapTimeout = window.setTimeout(() => pet.classList.remove("tap"), 180);
    }

    pet.addEventListener("pointerup", finishPointer);
    pet.addEventListener("pointercancel", finishPointer);
    pet.addEventListener("contextmenu", closePet);
    pet.addEventListener("dblclick", closePet);
    pet.addEventListener("pointerenter", () => setPointerInteractive(true));
    pet.addEventListener("pointerleave", () => {
      if (!drag) setPointerInteractive(false);
    });
    document.addEventListener("mousemove", (event) => {
      if (drag) return;
      setPointerInteractive(isInsidePet(event));
    });
  </script>
</body>
</html>`;
}

export class DesktopPetOverlayController {
  private window: BrowserWindow | null = null;
  private loadPromise: Promise<void> | null = null;
  private lastState: (DesktopPetOverlayState & { assetUrl: string }) | null = null;
  private lastEmittedPosition: DesktopPetOverlayPosition | null = null;
  private dragState: OverlayDragState | null = null;
  private pointerInteractive = true;
  private mousePassthroughEnabled = false;
  private readonly input: {
    preloadPath: string;
    resolvePetAssetPath: ResolvePetAssetPath;
    onMoved: OnMoved;
  };

  constructor(input: {
    preloadPath: string;
    resolvePetAssetPath: ResolvePetAssetPath;
    onMoved: OnMoved;
  }) {
    this.input = input;
  }

  async setState(input: unknown): Promise<void> {
    const state = normalizePetOverlayState(input, this.input.resolvePetAssetPath);
    if (!state || !state.visible) {
      if (state) {
        this.lastState = state;
      }
      this.hide();
      return;
    }

    this.lastState = state;
    await this.showState(state);
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  close(): void {
    this.lastState = this.lastState ? { ...this.lastState, visible: false } : null;
    this.hide();
  }

  startDrag(input: DesktopPetOverlayDragStartInput | null | undefined): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    if (typeof input !== "object" || input === null) return;
    const pointerWindowX = finiteIntegerInRange(
      input.pointerWindowX,
      -MAX_PET_WINDOW_SIZE,
      MAX_PET_WINDOW_SIZE,
    );
    const pointerWindowY = finiteIntegerInRange(
      input.pointerWindowY,
      -MAX_PET_WINDOW_SIZE,
      MAX_PET_WINDOW_SIZE,
    );
    if (pointerWindowX === null || pointerWindowY === null) return;
    this.dragState = {
      pointerAnchorX: pointerWindowX,
      pointerAnchorY: pointerWindowY,
      hasMoved: false,
    };
    this.pointerInteractive = true;
    this.applyPointerInteractivityPolicy();
    window.moveTop();
  }

  moveDrag(): void {
    const dragState = this.dragState;
    if (!dragState) return;
    dragState.hasMoved = true;
    this.moveDragToCurrentCursor(dragState);
  }

  endDrag(): void {
    const dragState = this.dragState;
    if (dragState?.hasMoved) {
      this.moveDragToCurrentCursor(dragState);
    }
    this.dragState = null;
    this.applyPointerInteractivityPolicy();
  }

  setPointerInteraction(input: DesktopPetOverlayPointerInteractionInput | null | undefined): void {
    if (typeof input !== "object" || input === null) return;
    const nextInteractive = input.interactive === true;
    if (this.pointerInteractive === nextInteractive) return;
    this.pointerInteractive = nextInteractive;
    this.applyPointerInteractivityPolicy();
  }

  isOverlayWindow(window: BrowserWindow | null | undefined): boolean {
    return Boolean(window && this.window === window && !window.isDestroyed());
  }

  dispose(): void {
    this.dragState = null;
    this.pointerInteractive = true;
    this.mousePassthroughEnabled = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
    this.loadPromise = null;
  }

  private async showState(state: DesktopPetOverlayState & { assetUrl: string }): Promise<void> {
    const window = this.ensureWindow();
    const layout = resolveOverlayLayout(state);
    const wasVisible = window.isVisible();
    const position = clampPetOverlayPosition({
      position: {
        x: state.x - layout.petLeft,
        y: state.y,
      },
      size: {
        width: layout.windowWidth,
        height: layout.windowHeight,
      },
      workAreas: screen.getAllDisplays().map((display) => display.workArea),
    });
    const nextBounds = {
      x: position.x,
      y: position.y,
      width: layout.windowWidth,
      height: layout.windowHeight,
    };
    const currentBounds = window.getBounds();
    this.lastEmittedPosition = { x: position.x + layout.petLeft, y: position.y };
    if (
      currentBounds.x !== nextBounds.x ||
      currentBounds.y !== nextBounds.y ||
      currentBounds.width !== nextBounds.width ||
      currentBounds.height !== nextBounds.height
    ) {
      window.setBounds(nextBounds);
    }
    if (!wasVisible) {
      window.setAlwaysOnTop(true, "floating", 1);
      this.makeVisibleOnEveryWorkspace(window);
      this.pointerInteractive = true;
      this.applyPointerInteractivityPolicy();
      window.moveTop();
      window.showInactive();
    }

    await this.waitForLoad();
    if (window.isDestroyed()) return;
    await window.webContents
      .executeJavaScript(`window.__setPetOverlayState(${JSON.stringify(state)})`, true)
      .catch(() => undefined);
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const window = new BrowserWindow({
      width: 96,
      height: 112,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      acceptFirstMouse: true,
      title: "T3 Pet",
      backgroundColor: "#00000000",
      webPreferences: {
        preload: this.input.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.setMenu(null);
    window.setAlwaysOnTop(true, "floating", 1);
    this.makeVisibleOnEveryWorkspace(window);
    window.on("move", () => {
      const bounds = window.getBounds();
      const state = this.lastState;
      const petLeft = state ? resolveOverlayLayout(state).petLeft : 0;
      this.emitMoved({ x: bounds.x + petLeft, y: bounds.y });
    });
    window.on("closed", () => {
      if (this.window === window) {
        this.window = null;
        this.loadPromise = null;
        this.dragState = null;
      }
    });

    this.window = window;
    this.loadPromise = new Promise((resolve) => {
      window.webContents.once("did-finish-load", () => resolve());
    });
    void window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(buildPetOverlayHtml())}`,
    );
    return window;
  }

  private makeVisibleOnEveryWorkspace(window: BrowserWindow): void {
    if (process.platform === "darwin") {
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      } as Electron.VisibleOnAllWorkspacesOptions);
      return;
    }
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  private moveDragToCurrentCursor(dragState: OverlayDragState): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = window.getBounds();
    const nextPosition = clampPetOverlayPosition({
      position: {
        x: cursor.x - dragState.pointerAnchorX,
        y: cursor.y - dragState.pointerAnchorY,
      },
      size: {
        width: bounds.width,
        height: bounds.height,
      },
      workAreas: screen.getAllDisplays().map((display) => display.workArea),
    });
    if (bounds.x === nextPosition.x && bounds.y === nextPosition.y) return;
    window.setPosition(nextPosition.x, nextPosition.y);
  }

  private emitMoved(position: DesktopPetOverlayPosition): void {
    if (this.lastEmittedPosition?.x === position.x && this.lastEmittedPosition?.y === position.y) {
      return;
    }
    this.lastEmittedPosition = position;
    this.input.onMoved(position);
  }

  private applyPointerInteractivityPolicy(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;

    const shouldPassThrough = !this.pointerInteractive && this.dragState === null;
    if (this.mousePassthroughEnabled === shouldPassThrough) return;
    this.mousePassthroughEnabled = shouldPassThrough;
    if (shouldPassThrough) {
      window.setIgnoreMouseEvents(true, { forward: true });
      return;
    }
    window.setIgnoreMouseEvents(false);
  }

  private async waitForLoad(): Promise<void> {
    await this.loadPromise;
  }
}
