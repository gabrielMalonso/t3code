import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect } from "vitest";

import { scopedSafeTeardown } from "./scopedSafeTeardown.ts";

describe("scopedSafeTeardown", () => {
  it.effect("returns the body value when teardown is clean", () =>
    Effect.gen(function* () {
      const finalizers: string[] = [];
      const wrapped = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalizers.push("clean");
          }),
        );
        return "body-ok";
      }).pipe(scopedSafeTeardown("test"));

      const value = yield* wrapped;
      expect(value).toBe("body-ok");
      expect(finalizers).toEqual(["clean"]);
    }),
  );

  it.effect("preserves body success when a finalizer dies", () =>
    Effect.gen(function* () {
      const finalizers: string[] = [];
      const wrapped = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalizers.push("ran-before-die");
          }),
        );
        yield* Effect.addFinalizer(() =>
          Effect.die(new Error("simulated subprocess kill failure")),
        );
        return "body-ok";
      }).pipe(scopedSafeTeardown("test"));

      const value = yield* wrapped;
      expect(value).toBe("body-ok");
      expect(finalizers).toEqual(["ran-before-die"]);
    }),
  );

  it.effect("preserves typed body failures even when teardown is clean", () =>
    Effect.gen(function* () {
      class BodyError {
        readonly _tag = "BodyError" as const;
      }
      const wrapped = Effect.gen(function* () {
        yield* Effect.addFinalizer(() => Effect.void);
        return yield* Effect.fail(new BodyError());
      }).pipe(scopedSafeTeardown("test"));

      const exit = yield* Effect.exit(wrapped);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const squashed = Cause.squash(exit.cause);
        expect(squashed).toBeInstanceOf(BodyError);
      }
    }),
  );

  it.effect("prefers the body failure over a teardown defect", () =>
    Effect.gen(function* () {
      class BodyError {
        readonly _tag = "BodyError" as const;
      }
      const wrapped = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.die(new Error("simulated subprocess kill failure")),
        );
        return yield* Effect.fail(new BodyError());
      }).pipe(scopedSafeTeardown("test"));

      const exit = yield* Effect.exit(wrapped);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const squashed = Cause.squash(exit.cause);
        expect(squashed).toBeInstanceOf(BodyError);
      }
    }),
  );
});
