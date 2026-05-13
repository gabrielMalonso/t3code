import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProcessRunner, layer as ProcessRunnerLive } from "../../processRunner.ts";
import { OpenPetsBridge } from "../Services/OpenPetsBridge.ts";
<<<<<<< HEAD
import { makeOpenPetsBridge, openPetsProcessErrorFromProcessRunError } from "../OpenPetsBridge.ts";

const makeLive = Effect.gen(function* () {
  const processRunner = yield* ProcessRunner;
  return yield* makeOpenPetsBridge({
    runProcess: (input) =>
      processRunner.run(input).pipe(Effect.mapError(openPetsProcessErrorFromProcessRunError)),
  });
});

export const OpenPetsBridgeLive = Layer.effect(OpenPetsBridge, makeLive).pipe(
=======
import { makeOpenPetsBridge } from "../OpenPetsBridge.ts";
import { layer as ProcessRunnerLive } from "../../processRunner.ts";

export const OpenPetsBridgeLive = Layer.effect(OpenPetsBridge, makeOpenPetsBridge()).pipe(
>>>>>>> origin/main
  Layer.provide(ProcessRunnerLive),
);
