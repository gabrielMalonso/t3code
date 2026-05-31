import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE =
  "t3code.external-composer-intake.request.v1" as const;

export const ExternalComposerIntakeImage = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  mimeType: Schema.optionalKey(TrimmedNonEmptyString),
  sizeBytes: Schema.optionalKey(Schema.Number),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
});
export type ExternalComposerIntakeImage = typeof ExternalComposerIntakeImage.Type;

export const ExternalComposerIntakeRequest = Schema.Struct({
  type: Schema.Literal(EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE),
  requestId: TrimmedNonEmptyString,
  source: Schema.Literal("annotations"),
  action: Schema.optionalKey(Schema.Literal("insert")),
  prompt: TrimmedNonEmptyString,
  append: Schema.optionalKey(Schema.Boolean),
  focus: Schema.optionalKey(Schema.Boolean),
  image: Schema.NullOr(ExternalComposerIntakeImage),
});
export type ExternalComposerIntakeRequest = typeof ExternalComposerIntakeRequest.Type;

export const ExternalComposerIntakeSubscription = Schema.Struct({
  subscriberId: TrimmedNonEmptyString,
  threadId: Schema.NullOr(TrimmedNonEmptyString),
  threadTitle: Schema.optionalKey(Schema.NullOr(TrimmedNonEmptyString)),
  activatedAtEpochMs: Schema.Number,
  clientKind: Schema.optionalKey(Schema.Literals(["browser", "desktop"])),
});
export type ExternalComposerIntakeSubscription = typeof ExternalComposerIntakeSubscription.Type;

export const ExternalComposerIntakeStatusTarget = Schema.Struct({
  subscriberId: TrimmedNonEmptyString,
  threadId: TrimmedNonEmptyString,
  threadTitle: Schema.NullOr(TrimmedNonEmptyString),
  clientKind: Schema.Literals(["browser", "desktop"]),
  activatedAtEpochMs: Schema.Number,
  lastSeenAtEpochMs: Schema.Number,
});
export type ExternalComposerIntakeStatusTarget = typeof ExternalComposerIntakeStatusTarget.Type;

export const ExternalComposerIntakeStatus = Schema.Struct({
  ok: Schema.Literal(true),
  connected: Schema.Boolean,
  reason: Schema.NullOr(Schema.Literal("composer-not-connected")),
  checkedAtEpochMs: Schema.Number,
  target: Schema.NullOr(ExternalComposerIntakeStatusTarget),
});
export type ExternalComposerIntakeStatus = typeof ExternalComposerIntakeStatus.Type;

export const ExternalComposerIntakeDeliveryAck = Schema.Struct({
  subscriberId: TrimmedNonEmptyString,
  deliveryId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
});
export type ExternalComposerIntakeDeliveryAck = typeof ExternalComposerIntakeDeliveryAck.Type;

export const ExternalComposerIntakeStreamEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("externalComposerIntakeReceived"),
  deliveryId: TrimmedNonEmptyString,
  subscriberId: TrimmedNonEmptyString,
  payload: ExternalComposerIntakeRequest,
});
export type ExternalComposerIntakeStreamEvent = typeof ExternalComposerIntakeStreamEvent.Type;
