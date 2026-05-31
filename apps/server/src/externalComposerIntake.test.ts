import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import {
  ExternalComposerIntake,
  ExternalComposerIntakeLive,
  selectActiveExternalComposerSubscriber,
} from "./externalComposerIntake.ts";

describe("selectActiveExternalComposerSubscriber", () => {
  it("selects the most recently activated chat", () => {
    expect(
      selectActiveExternalComposerSubscriber([
        {
          subscriberId: "older-chat",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 2,
        },
        {
          subscriberId: "newer-chat",
          activatedAtEpochMs: 200,
          registeredAtEpochMs: 1,
        },
      ]),
    ).toMatchObject({ subscriberId: "newer-chat" });
  });

  it("uses registration order as the tie breaker", () => {
    expect(
      selectActiveExternalComposerSubscriber([
        {
          subscriberId: "first-registration",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 1,
        },
        {
          subscriberId: "second-registration",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 2,
        },
      ]),
    ).toMatchObject({ subscriberId: "second-registration" });
  });

  it("prefers desktop subscribers over browser subscribers", () => {
    expect(
      selectActiveExternalComposerSubscriber([
        {
          subscriberId: "newer-browser-tab",
          activatedAtEpochMs: 300,
          registeredAtEpochMs: 2,
          clientKind: "browser",
        },
        {
          subscriberId: "visible-desktop-app",
          activatedAtEpochMs: 100,
          registeredAtEpochMs: 1,
          clientKind: "desktop",
        },
      ]),
    ).toMatchObject({ subscriberId: "visible-desktop-app" });
  });
});

describe("ExternalComposerIntake.publish", () => {
  it("reports no active composer when nothing is subscribed", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const intake = yield* ExternalComposerIntake;
          return yield* intake.publish(testRequest);
        }).pipe(Effect.provide(ExternalComposerIntakeLive)),
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "no-active-composer",
    });
  });

  it("reports delivery failure when the subscriber rejects the event", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const intake = yield* ExternalComposerIntake;
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* intake.stream(testSubscription).pipe(
                Stream.runForEach((event) =>
                  intake.ack({
                    subscriberId: event.subscriberId,
                    deliveryId: event.deliveryId,
                    ok: false,
                  }),
                ),
                Effect.forkScoped,
              );

              yield* Effect.sleep("10 millis");
              return yield* intake.publish(testRequest);
            }),
          );
        }).pipe(Effect.provide(ExternalComposerIntakeLive)),
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "delivery-failed",
    });
  });

  it("keeps the subscriber usable after a rejected delivery", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const intake = yield* ExternalComposerIntake;
          return yield* Effect.scoped(
            Effect.gen(function* () {
              let deliveryCount = 0;
              yield* intake.stream(testSubscription).pipe(
                Stream.runForEach((event) =>
                  Effect.gen(function* () {
                    deliveryCount += 1;
                    yield* intake.ack({
                      subscriberId: event.subscriberId,
                      deliveryId: event.deliveryId,
                      ok: deliveryCount > 1,
                    });
                  }),
                ),
                Effect.forkScoped,
              );

              yield* Effect.sleep("10 millis");
              const first = yield* intake.publish(testRequest);
              const second = yield* intake.publish(testRequest);
              return { deliveryCount, first, second };
            }),
          );
        }).pipe(Effect.provide(ExternalComposerIntakeLive)),
      ),
    ).resolves.toEqual({
      deliveryCount: 2,
      first: {
        ok: false,
        reason: "delivery-failed",
      },
      second: {
        ok: true,
      },
    });
  });

  it("keeps the subscriber usable after a timed out delivery", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const intake = yield* ExternalComposerIntake;
          return yield* Effect.scoped(
            Effect.gen(function* () {
              let deliveryCount = 0;
              yield* intake.stream(testSubscription).pipe(
                Stream.runForEach((event) =>
                  Effect.gen(function* () {
                    deliveryCount += 1;
                    if (deliveryCount === 1) return;
                    yield* intake.ack({
                      subscriberId: event.subscriberId,
                      deliveryId: event.deliveryId,
                      ok: true,
                    });
                  }),
                ),
                Effect.forkScoped,
              );

              yield* Effect.sleep("10 millis");
              const first = yield* intake.publish(testRequest);
              const second = yield* intake.publish(testRequest);
              return { deliveryCount, first, second };
            }),
          );
        }).pipe(Effect.provide(ExternalComposerIntakeLive)),
      ),
    ).resolves.toEqual({
      deliveryCount: 2,
      first: {
        ok: false,
        reason: "delivery-timeout",
      },
      second: {
        ok: true,
      },
    });
  });

  it("succeeds when the subscriber acknowledges the event", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const intake = yield* ExternalComposerIntake;
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* intake.stream(testSubscription).pipe(
                Stream.runForEach((event) =>
                  intake.ack({
                    subscriberId: event.subscriberId,
                    deliveryId: event.deliveryId,
                    ok: true,
                  }),
                ),
                Effect.forkScoped,
              );

              yield* Effect.sleep("10 millis");
              return yield* intake.publish(testRequest);
            }),
          );
        }).pipe(Effect.provide(ExternalComposerIntakeLive)),
      ),
    ).resolves.toEqual({
      ok: true,
    });
  });
});

const testSubscription = {
  subscriberId: "composer-test",
  threadId: "thread-test",
  threadTitle: "Composer test",
  activatedAtEpochMs: 100,
  clientKind: "desktop" as const,
};

const testRequest = {
  type: "t3code.external-composer-intake.request.v1" as const,
  requestId: "annotations-test",
  source: "annotations" as const,
  action: "insert" as const,
  prompt: "# UI Note",
  append: true,
  focus: true,
  image: null,
};
