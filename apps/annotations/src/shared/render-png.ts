import { computeCropPlan } from "./crop";
import type { CaptureRequest, Rect } from "./types";

export type RenderHighlightedPngInput = {
  request: CaptureRequest;
  screenshotDataUrl: string;
  marginCssPx?: number;
};

export type HighlightedPng = {
  blob: Blob;
  dataUrl: string;
  imageBytes: number;
  width: number;
  height: number;
};

export type CanvasLayout = {
  width: number;
  height: number;
  cropRect: Rect;
  renderScale: number;
};

const FOCUS_MASK = "rgba(7, 24, 39, 0.24)";
const FOCUS_PINK = "#ff2f9c";
const FOCUS_GLOW = "rgba(255, 47, 156, 0.42)";
const MAX_WIDTH = 1440;
const DEFAULT_CONTEXT_WIDTH = 960;
const DEFAULT_CONTEXT_HEIGHT = 720;

export function calculateCanvasLayout(cropSource: Rect): CanvasLayout {
  const renderScale = cropSource.width > MAX_WIDTH ? MAX_WIDTH / cropSource.width : 1;
  const width = Math.max(1, Math.round(cropSource.width * renderScale));
  const height = Math.max(1, Math.round(cropSource.height * renderScale));

  return {
    width,
    height,
    cropRect: {
      x: 0,
      y: 0,
      width,
      height,
    },
    renderScale,
  };
}

export async function renderHighlightedPng(
  input: RenderHighlightedPngInput,
): Promise<HighlightedPng> {
  const image = await loadImage(input.screenshotDataUrl);
  const request = input.request;
  const crop = computeCropPlan(
    request.element.boundingRect,
    request.element.viewport,
    { width: image.naturalWidth, height: image.naturalHeight },
    {
      marginCssPx: input.marginCssPx ?? 48,
      minCropCssWidth: DEFAULT_CONTEXT_WIDTH,
      minCropCssHeight: DEFAULT_CONTEXT_HEIGHT,
    },
  );
  const layout = calculateCanvasLayout(crop.source);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("render-failed: canvas context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  drawScreenshotCrop(ctx, image, crop.source, layout);
  drawElementHighlight(ctx, crop.element, layout);

  const blob = await canvasToBlob(canvas);

  return {
    blob,
    dataUrl: canvas.toDataURL("image/png"),
    imageBytes: blob.size,
    width: canvas.width,
    height: canvas.height,
  };
}

function drawScreenshotCrop(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: Rect,
  layout: CanvasLayout,
): void {
  ctx.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    layout.cropRect.x,
    layout.cropRect.y,
    layout.cropRect.width,
    layout.cropRect.height,
  );
}

function drawElementHighlight(
  ctx: CanvasRenderingContext2D,
  element: Rect,
  layout: CanvasLayout,
): void {
  if (element.width <= 0 || element.height <= 0) return;

  const scale = layout.renderScale;
  const x = element.x * scale;
  const y = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;
  const cropRight = layout.cropRect.width;
  const cropBottom = layout.cropRect.height;

  ctx.save();
  ctx.fillStyle = FOCUS_MASK;
  ctx.fillRect(0, 0, layout.width, Math.max(0, y));
  ctx.fillRect(0, y + height, layout.width, Math.max(0, cropBottom - y - height));
  ctx.fillRect(0, y, Math.max(0, x), height);
  ctx.fillRect(x + width, y, Math.max(0, cropRight - x - width), height);

  ctx.strokeStyle = "rgba(248, 251, 255, 0.96)";
  ctx.lineWidth = Math.max(4, 4 * scale);
  ctx.strokeRect(x, y, width, height);

  ctx.strokeStyle = FOCUS_PINK;
  ctx.lineWidth = Math.max(2, 2 * scale);
  ctx.shadowColor = FOCUS_GLOW;
  ctx.shadowBlur = 12;
  ctx.strokeRect(x, y, width, height);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
  ctx.lineWidth = Math.max(1, 1 * scale);
  ctx.strokeRect(x + 2, y + 2, Math.max(0, width - 4), Math.max(0, height - 4));
  ctx.restore();
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("render-failed: screenshot image could not load")),
      { once: true },
    );
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("render-failed: canvas did not produce a blob"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
