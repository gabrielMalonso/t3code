import type { OpenPetsRuntimeStatus } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export type OpenPetsNotificationStatus =
  | "running"
  | "review"
  | "done"
  | "failed"
  | "waiting"
  | "message";

export interface OpenPetsNotifyInput {
  readonly key: string;
  readonly title: string;
  readonly text: string;
  readonly status: OpenPetsNotificationStatus;
}

export interface OpenPetsBridgeShape {
  readonly notify: (input: OpenPetsNotifyInput) => Effect.Effect<void>;
  readonly getStatus: Effect.Effect<OpenPetsRuntimeStatus>;
  readonly refreshStatus: Effect.Effect<OpenPetsRuntimeStatus>;
}

export class OpenPetsBridge extends Context.Service<OpenPetsBridge, OpenPetsBridgeShape>()(
  "t3/openpets/Services/OpenPetsBridge",
) {}
