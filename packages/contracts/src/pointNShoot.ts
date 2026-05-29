import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const POINTNSHOOT_EXTENSION_ID = "bjfbbbpniplpolcnbmehjcopajibfnhf";
export const POINTNSHOOT_EXTENSION_ORIGIN = `chrome-extension://${POINTNSHOOT_EXTENSION_ID}`;
export const POINTNSHOOT_COMPOSER_INTAKE_REQUEST_TYPE =
  "t3code.composer-intake.request.v1" as const;

export const PointNShootComposerIntakeImage = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  mimeType: Schema.optionalKey(TrimmedNonEmptyString),
  sizeBytes: Schema.optionalKey(Schema.Number),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
});
export type PointNShootComposerIntakeImage = typeof PointNShootComposerIntakeImage.Type;

export const PointNShootComposerIntakeRequest = Schema.Struct({
  type: Schema.Literal(POINTNSHOOT_COMPOSER_INTAKE_REQUEST_TYPE),
  requestId: TrimmedNonEmptyString,
  source: Schema.Literal("pointnshoot"),
  action: Schema.optionalKey(Schema.Literal("insert")),
  prompt: TrimmedNonEmptyString,
  append: Schema.optionalKey(Schema.Boolean),
  focus: Schema.optionalKey(Schema.Boolean),
  image: Schema.NullOr(PointNShootComposerIntakeImage),
});
export type PointNShootComposerIntakeRequest = typeof PointNShootComposerIntakeRequest.Type;

export const PointNShootComposerIntakeSubscription = Schema.Struct({
  subscriberId: TrimmedNonEmptyString,
  threadId: Schema.NullOr(TrimmedNonEmptyString),
  activatedAtEpochMs: Schema.Number,
  clientKind: Schema.optionalKey(Schema.Literals(["browser", "desktop"])),
});
export type PointNShootComposerIntakeSubscription =
  typeof PointNShootComposerIntakeSubscription.Type;

export const PointNShootComposerIntakeDeliveryAck = Schema.Struct({
  subscriberId: TrimmedNonEmptyString,
  deliveryId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
});
export type PointNShootComposerIntakeDeliveryAck = typeof PointNShootComposerIntakeDeliveryAck.Type;

export const PointNShootComposerIntakeStreamEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("composerIntakeReceived"),
  deliveryId: TrimmedNonEmptyString,
  subscriberId: TrimmedNonEmptyString,
  payload: PointNShootComposerIntakeRequest,
});
export type PointNShootComposerIntakeStreamEvent = typeof PointNShootComposerIntakeStreamEvent.Type;
