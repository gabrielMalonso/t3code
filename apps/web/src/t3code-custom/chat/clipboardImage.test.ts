import { beforeEach, describe, expect, it, vi } from "vitest";

const clipboardRead = vi.hoisted(() => vi.fn());
const registerPlugin = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    read: clipboardRead,
  },
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin,
}));

import {
  imageFileFromClipboardDataUrl,
  readCapacitorClipboardImageFile,
  readCapacitorClipboardImageFiles,
} from "./clipboardImage";

describe("clipboard image helpers", () => {
  beforeEach(() => {
    clipboardRead.mockReset();
    registerPlugin.mockReset();
  });

  it("creates an image file from a base64 data URL", async () => {
    const file = imageFileFromClipboardDataUrl("data:image/png;base64,SGVsbG8=");

    expect(file).not.toBeNull();
    expect(file?.name).toBe("clipboard-image.png");
    expect(file?.type).toBe("image/png");
    expect(file?.size).toBe(5);
    await expect(file?.text()).resolves.toBe("Hello");
  });

  it("rejects non-image clipboard data URLs", () => {
    expect(imageFileFromClipboardDataUrl("data:text/plain;base64,SGVsbG8=")).toBeNull();
  });

  it("rejects non-base64 image data URLs", () => {
    expect(imageFileFromClipboardDataUrl("data:image/png,hello")).toBeNull();
  });

  it("rejects image data URLs before decoding when they exceed the attachment limit", () => {
    const atob = vi.spyOn(globalThis, "atob");

    expect(
      imageFileFromClipboardDataUrl(`data:image/png;base64,${"A".repeat(14_000_000)}`),
    ).toBeNull();
    expect(atob).not.toHaveBeenCalled();

    atob.mockRestore();
  });

  it("reads an image file from Capacitor clipboard data", async () => {
    clipboardRead.mockResolvedValue({
      type: "image/png",
      value: "data:image/png;base64,SGVsbG8=",
    });

    const file = await readCapacitorClipboardImageFile();

    expect(file?.name).toBe("clipboard-image.png");
    expect(file?.type).toBe("image/png");
    await expect(file?.text()).resolves.toBe("Hello");
  });

  it("returns null when Capacitor clipboard has no image data URL", async () => {
    clipboardRead.mockResolvedValue({
      type: "text/plain",
      value: "just text",
    });

    await expect(readCapacitorClipboardImageFile()).resolves.toBeNull();
  });

  it("reads native Android clipboard image data before generic clipboard data", async () => {
    const nativeReadImage = vi.fn().mockResolvedValue({
      type: "image/png",
      value: "data:image/png;base64,SGVsbG8=",
    });
    registerPlugin.mockReturnValue({ readImage: nativeReadImage });

    const file = await readCapacitorClipboardImageFile();

    expect(nativeReadImage).toHaveBeenCalledOnce();
    expect(clipboardRead).not.toHaveBeenCalled();
    expect(file?.name).toBe("clipboard-image.png");
    await expect(file?.text()).resolves.toBe("Hello");
  });

  it("reads multiple native Android clipboard image items", async () => {
    registerPlugin.mockReturnValue({
      readImage: vi.fn().mockResolvedValue({
        items: [
          { type: "image/png", value: "data:image/png;base64,SGVsbG8=" },
          { type: "image/jpeg", value: "data:image/jpeg;base64,V29ybGQ=" },
        ],
      }),
    });

    const files = await readCapacitorClipboardImageFiles();

    expect(files).toHaveLength(2);
    expect(files[0]?.name).toBe("clipboard-image.png");
    expect(files[1]?.name).toBe("clipboard-image.jpg");
    await expect(files[0]?.text()).resolves.toBe("Hello");
    await expect(files[1]?.text()).resolves.toBe("World");
    expect(clipboardRead).not.toHaveBeenCalled();
  });

  it("falls back to generic clipboard data when native Android has no image", async () => {
    registerPlugin.mockReturnValue({
      readImage: vi.fn().mockResolvedValue({ type: "", value: "" }),
    });
    clipboardRead.mockResolvedValue({
      type: "image/png",
      value: "data:image/png;base64,SGVsbG8=",
    });

    const file = await readCapacitorClipboardImageFile();

    expect(file?.name).toBe("clipboard-image.png");
    expect(clipboardRead).toHaveBeenCalledOnce();
  });
});
