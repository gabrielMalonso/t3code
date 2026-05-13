import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProcessRunner, layer as ProcessRunnerLive } from "../../processRunner.ts";
import { OpenPetsBridge } from "../Services/OpenPetsBridge.ts";
import { makeOpenPetsBridge, OpenPetsProcessError } from "../OpenPetsBridge.ts";

const makeLive = Effect.gen(function* () {
  const processRunner = yield* ProcessRunner;
  return yield* makeOpenPetsBridge({
    runProcess: (input) =>
      processRunner.run(input).pipe(
        Effect.mapError(
          (error) =>
            new OpenPetsProcessError({
              cause: error,
              message: error instanceof Error ? error.message : String(error),
            }),
        ),
      ),
  });
});

export const OpenPetsBridgeLive = Layer.effect(OpenPetsBridge, makeLive).pipe(
  Layer.provide(ProcessRunnerLive),
);
