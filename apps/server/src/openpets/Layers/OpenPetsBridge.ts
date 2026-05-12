import * as Layer from "effect/Layer";

import { OpenPetsBridge } from "../Services/OpenPetsBridge.ts";
import { makeOpenPetsBridge } from "../OpenPetsBridge.ts";

export const OpenPetsBridgeLive = Layer.effect(OpenPetsBridge, makeOpenPetsBridge());
