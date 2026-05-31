import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ExternalComposerIntakeStatusTarget } from "./externalComposerIntake.ts";

export const ANNOTATIONS_BRIDGE_PROTOCOL_VERSION = 1 as const;
export const ANNOTATIONS_BRIDGE_DELIVER_REQUEST_TYPE =
  "t3code.annotations.bridge.deliver.v1" as const;

export const AnnotationsBridgeFailureReason = Schema.Literals([
  "app-unreachable",
  "not-paired",
  "pairing-pending",
  "pairing-rejected",
  "pairing-expired",
  "pairing-rate-limited",
  "unauthorized",
  "bridge-disabled",
  "remote-bridge-disabled",
  "no-active-composer",
  "protocol-version-mismatch",
  "delivery-timeout",
  "delivery-failed",
  "invalid-payload",
]);
export type AnnotationsBridgeFailureReason = typeof AnnotationsBridgeFailureReason.Type;

export const AnnotationsBridgeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  allowRemoteClients: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type AnnotationsBridgeSettings = typeof AnnotationsBridgeSettings.Type;

export const AnnotationsBridgeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  allowRemoteClients: Schema.optionalKey(Schema.Boolean),
});
export type AnnotationsBridgeSettingsPatch = typeof AnnotationsBridgeSettingsPatch.Type;

export const AnnotationsBridgeManifestStatus = Schema.Literals([
  "ready",
  "disabled",
  "remote-blocked",
]);
export type AnnotationsBridgeManifestStatus = typeof AnnotationsBridgeManifestStatus.Type;

export const AnnotationsBridgeManifest = Schema.Struct({
  protocolVersion: Schema.Literal(ANNOTATIONS_BRIDGE_PROTOCOL_VERSION),
  appVersion: TrimmedNonEmptyString,
  pairingRequired: Schema.Boolean,
  bridgeEnabled: Schema.Boolean,
  status: AnnotationsBridgeManifestStatus,
});
export type AnnotationsBridgeManifest = typeof AnnotationsBridgeManifest.Type;

export const AnnotationsBridgePairingRequest = Schema.Struct({
  protocolVersion: Schema.Literal(ANNOTATIONS_BRIDGE_PROTOCOL_VERSION),
  clientInstallId: TrimmedNonEmptyString,
  clientName: Schema.optionalKey(TrimmedNonEmptyString),
  extensionId: Schema.optionalKey(TrimmedNonEmptyString),
  browser: Schema.optionalKey(TrimmedNonEmptyString),
});
export type AnnotationsBridgePairingRequest = typeof AnnotationsBridgePairingRequest.Type;

export const AnnotationsBridgePairingRequestResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    requestId: TrimmedNonEmptyString,
    pollSecret: TrimmedNonEmptyString,
    status: Schema.Literal("pending"),
    expiresAtEpochMs: Schema.Number,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: AnnotationsBridgeFailureReason,
    message: Schema.optionalKey(TrimmedNonEmptyString),
  }),
]);
export type AnnotationsBridgePairingRequestResult =
  typeof AnnotationsBridgePairingRequestResult.Type;

export const AnnotationsBridgePairingStatusRequest = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  pollSecret: TrimmedNonEmptyString,
});
export type AnnotationsBridgePairingStatusRequest =
  typeof AnnotationsBridgePairingStatusRequest.Type;

export const AnnotationsBridgePairingStatusResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    status: Schema.Literal("approved"),
    clientId: TrimmedNonEmptyString,
    token: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    status: Schema.Literals(["pending", "rejected", "expired"]),
    reason: AnnotationsBridgeFailureReason,
    message: Schema.optionalKey(TrimmedNonEmptyString),
  }),
]);
export type AnnotationsBridgePairingStatusResult = typeof AnnotationsBridgePairingStatusResult.Type;

export const AnnotationsBridgePendingPairingRequest = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  clientInstallId: TrimmedNonEmptyString,
  clientName: Schema.NullOr(TrimmedNonEmptyString),
  extensionId: Schema.NullOr(TrimmedNonEmptyString),
  origin: Schema.NullOr(TrimmedNonEmptyString),
  browser: Schema.NullOr(TrimmedNonEmptyString),
  createdAtEpochMs: Schema.Number,
  expiresAtEpochMs: Schema.Number,
});
export type AnnotationsBridgePendingPairingRequest =
  typeof AnnotationsBridgePendingPairingRequest.Type;

export const AnnotationsBridgePairingDecision = Schema.Struct({
  requestId: TrimmedNonEmptyString,
});
export type AnnotationsBridgePairingDecision = typeof AnnotationsBridgePairingDecision.Type;

export const AnnotationsBridgeClient = Schema.Struct({
  clientId: TrimmedNonEmptyString,
  clientInstallId: TrimmedNonEmptyString,
  clientName: Schema.NullOr(TrimmedNonEmptyString),
  extensionId: Schema.NullOr(TrimmedNonEmptyString),
  origin: Schema.NullOr(TrimmedNonEmptyString),
  browser: Schema.NullOr(TrimmedNonEmptyString),
  createdAtEpochMs: Schema.Number,
  lastSeenAtEpochMs: Schema.NullOr(Schema.Number),
  revokedAtEpochMs: Schema.NullOr(Schema.Number),
});
export type AnnotationsBridgeClient = typeof AnnotationsBridgeClient.Type;

export const AnnotationsBridgeImage = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  mimeType: Schema.optionalKey(TrimmedNonEmptyString),
  sizeBytes: Schema.optionalKey(Schema.Number),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
});
export type AnnotationsBridgeImage = typeof AnnotationsBridgeImage.Type;

export const AnnotationsBridgeDeliverRequest = Schema.Struct({
  type: Schema.Literal(ANNOTATIONS_BRIDGE_DELIVER_REQUEST_TYPE),
  requestId: TrimmedNonEmptyString,
  action: Schema.optionalKey(Schema.Literal("insert")),
  prompt: TrimmedNonEmptyString,
  append: Schema.optionalKey(Schema.Boolean),
  focus: Schema.optionalKey(Schema.Boolean),
  image: Schema.NullOr(AnnotationsBridgeImage),
});
export type AnnotationsBridgeDeliverRequest = typeof AnnotationsBridgeDeliverRequest.Type;

export const AnnotationsBridgeStatus = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    connected: Schema.Boolean,
    reason: Schema.NullOr(Schema.Literals(["bridge-disabled", "no-active-composer"])),
    checkedAtEpochMs: Schema.Number,
    target: Schema.NullOr(ExternalComposerIntakeStatusTarget),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: AnnotationsBridgeFailureReason,
    message: Schema.optionalKey(TrimmedNonEmptyString),
  }),
]);
export type AnnotationsBridgeStatus = typeof AnnotationsBridgeStatus.Type;

export const AnnotationsBridgeDeliveryResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    requestId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    requestId: Schema.optionalKey(TrimmedNonEmptyString),
    reason: AnnotationsBridgeFailureReason,
    message: Schema.optionalKey(TrimmedNonEmptyString),
  }),
]);
export type AnnotationsBridgeDeliveryResult = typeof AnnotationsBridgeDeliveryResult.Type;

export const AnnotationsBridgeRevokeClientRequest = Schema.Struct({
  clientId: TrimmedNonEmptyString,
});
export type AnnotationsBridgeRevokeClientRequest = typeof AnnotationsBridgeRevokeClientRequest.Type;
