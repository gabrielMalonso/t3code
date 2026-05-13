import * as Layer from "effect/Layer";

import { OpenPetsBridge } from "../Services/OpenPetsBridge.ts";
import { makeOpenPetsBridge } from "../OpenPetsBridge.ts";
import { layer as ProcessRunnerLive } from "../../processRunner.ts";

export const OpenPetsBridgeLive = Layer.effect(OpenPetsBridge, makeOpenPetsBridge()).pipe(
  Layer.provide(ProcessRunnerLive),
);
