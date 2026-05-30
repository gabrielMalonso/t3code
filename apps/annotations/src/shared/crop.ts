import type { Rect, ViewportInfo } from "./types";

export type ScreenshotSize = {
  width: number;
  height: number;
};

export type CropPlan = {
  source: Rect;
  element: Rect;
  visibleElement: Rect;
  scaleX: number;
  scaleY: number;
};

export type CropOptions = {
  marginCssPx?: number;
  minCropCssWidth?: number;
  minCropCssHeight?: number;
};

export function computeCropPlan(
  elementRect: Rect,
  viewport: ViewportInfo,
  screenshot: ScreenshotSize,
  options: number | CropOptions = 48,
): CropPlan {
  const cropOptions = typeof options === "number" ? { marginCssPx: options } : options;
  const marginCssPx = cropOptions.marginCssPx ?? 48;
  const scaleX = screenshot.width / Math.max(1, viewport.width);
  const scaleY = screenshot.height / Math.max(1, viewport.height);
  const visibleElement = intersectRects(elementRect, {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });

  const targetCss = fitRectWithinBounds(
    expandRectToMinimumSize(
      {
        x: visibleElement.x - marginCssPx,
        y: visibleElement.y - marginCssPx,
        width: visibleElement.width + marginCssPx * 2,
        height: visibleElement.height + marginCssPx * 2,
      },
      visibleElement,
      cropOptions.minCropCssWidth,
      cropOptions.minCropCssHeight,
    ),
    { width: viewport.width, height: viewport.height },
  );

  const source = clampRect(
    {
      x: targetCss.x * scaleX,
      y: targetCss.y * scaleY,
      width: targetCss.width * scaleX,
      height: targetCss.height * scaleY,
    },
    screenshot,
  );

  const element = {
    x: visibleElement.x * scaleX - source.x,
    y: visibleElement.y * scaleY - source.y,
    width: visibleElement.width * scaleX,
    height: visibleElement.height * scaleY,
  };

  return { source, element, visibleElement, scaleX, scaleY };
}

function expandRectToMinimumSize(
  rect: Rect,
  anchor: Rect,
  minWidth?: number,
  minHeight?: number,
): Rect {
  const next = { ...rect };

  if (minWidth && next.width < minWidth) {
    const centerX = anchor.x + anchor.width / 2;
    next.x = centerX - minWidth / 2;
    next.width = minWidth;
  }

  if (minHeight && next.height < minHeight) {
    const centerY = anchor.y + anchor.height / 2;
    next.y = centerY - minHeight / 2;
    next.height = minHeight;
  }

  return next;
}

function fitRectWithinBounds(rect: Rect, bounds: ScreenshotSize): Rect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);

  return {
    x: clamp(rect.x, 0, Math.max(0, bounds.width - width)),
    y: clamp(rect.y, 0, Math.max(0, bounds.height - height)),
    width,
    height,
  };
}

export function intersectRects(a: Rect, b: Rect): Rect {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

export function clampRect(rect: Rect, bounds: ScreenshotSize): Rect {
  const x = clamp(rect.x, 0, bounds.width);
  const y = clamp(rect.y, 0, bounds.height);
  const right = clamp(rect.x + rect.width, 0, bounds.width);
  const bottom = clamp(rect.y + rect.height, 0, bounds.height);

  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.max(1, Math.ceil(right - x)),
    height: Math.max(1, Math.ceil(bottom - y)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
