import { describe, expect, it } from "vitest";

import {
  canRequestReviewThread,
  shouldDeleteThreadAfterStartFailure,
} from "./reviewThread";

describe("canRequestReviewThread", () => {
  it("returns true only when the current thread can actually start a review", () => {
    expect(
      canRequestReviewThread({
        hasActiveThread: true,
        hasActiveProject: true,
        isServerThread: true,
        isSendBusy: false,
        isConnecting: false,
      }),
    ).toBe(true);
  });

  it("returns false for local draft threads", () => {
    expect(
      canRequestReviewThread({
        hasActiveThread: true,
        hasActiveProject: true,
        isServerThread: false,
        isSendBusy: false,
        isConnecting: false,
      }),
    ).toBe(false);
  });

  it("returns false while the thread is busy", () => {
    expect(
      canRequestReviewThread({
        hasActiveThread: true,
        hasActiveProject: true,
        isServerThread: true,
        isSendBusy: true,
        isConnecting: false,
      }),
    ).toBe(false);
  });
});

describe("shouldDeleteThreadAfterStartFailure", () => {
  it("does not delete anything before the thread exists", () => {
    expect(shouldDeleteThreadAfterStartFailure("before-thread-create")).toBe(false);
  });

  it("deletes a thread when creation succeeded but turn start failed", () => {
    expect(shouldDeleteThreadAfterStartFailure("thread-created")).toBe(true);
  });

  it("keeps the thread when the turn has already started", () => {
    expect(shouldDeleteThreadAfterStartFailure("turn-started")).toBe(false);
  });
});
