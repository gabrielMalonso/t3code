import {
  ANNOTATIONS_BRIDGE_PROTOCOL_VERSION,
  ANNOTATIONS_BRIDGE_DELIVER_REQUEST_TYPE,
  type AnnotationsBridgeClient,
  type AnnotationsBridgeDeliverRequest,
  type AnnotationsBridgeDeliveryResult,
  type AnnotationsBridgeManifest,
  type AnnotationsBridgePairingRequest,
  type AnnotationsBridgePairingRequestResult,
  type AnnotationsBridgePairingStatusRequest,
  type AnnotationsBridgePairingStatusResult,
  type AnnotationsBridgePendingPairingRequest,
  type AnnotationsBridgeStatus,
  EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
  type ExternalComposerIntakeRequest,
} from "@t3tools/contracts";
import * as crypto from "node:crypto";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import { EnvironmentAuth } from "./auth/EnvironmentAuth.ts";
import { ServerSecretStore } from "./auth/ServerSecretStore.ts";
import { ExternalComposerIntake } from "./externalComposerIntake.ts";
import { ServerSettingsService } from "./serverSettings.ts";

const TOKEN_HASH_PEPPER_SECRET = "annotations-bridge-token-pepper";
const CLIENTS_SECRET = "annotations-bridge-clients-v1";
const PAIRING_TTL_MS = 2 * 60_000;
const PAIRING_RATE_LIMIT_WINDOW_MS = 60_000;
const PAIRING_RATE_LIMIT_MAX = 8;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

export type BridgeClientRecord = AnnotationsBridgeClient & {
  readonly tokenHash: string;
};

const BridgeClientRecordSchema = Schema.Struct({
  clientId: Schema.String,
  clientInstallId: Schema.String,
  clientName: Schema.NullOr(Schema.String),
  extensionId: Schema.NullOr(Schema.String),
  origin: Schema.NullOr(Schema.String),
  browser: Schema.NullOr(Schema.String),
  createdAtEpochMs: Schema.Number,
  lastSeenAtEpochMs: Schema.NullOr(Schema.Number),
  revokedAtEpochMs: Schema.NullOr(Schema.Number),
  tokenHash: Schema.String,
});

const BridgeClientRecordsSchema = Schema.Array(BridgeClientRecordSchema);
const BridgeClientRecordsJson = Schema.fromJsonString(BridgeClientRecordsSchema);
const decodeBridgeClientRecordsJson = Schema.decodeUnknownEffect(BridgeClientRecordsJson);
const encodeBridgeClientRecordsJson = Schema.encodeEffect(BridgeClientRecordsJson);

type PendingPairingRecord = AnnotationsBridgePendingPairingRequest & {
  readonly pollSecretHash: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly approvedClientId: string | null;
  readonly approvedToken: string | null;
};

export interface AuthenticatedAnnotationsBridgeClient {
  readonly client: AnnotationsBridgeClient;
  readonly token: string;
}

export interface AnnotationsBridgeShape {
  readonly getManifest: Effect.Effect<AnnotationsBridgeManifest>;
  readonly createPairingRequest: (input: {
    readonly payload: AnnotationsBridgePairingRequest;
    readonly origin: string | null;
    readonly userAgent: string | null;
  }) => Effect.Effect<AnnotationsBridgePairingRequestResult>;
  readonly readPairingStatus: (
    input: AnnotationsBridgePairingStatusRequest,
  ) => Effect.Effect<AnnotationsBridgePairingStatusResult>;
  readonly listPendingPairingRequests: Effect.Effect<
    ReadonlyArray<AnnotationsBridgePendingPairingRequest>
  >;
  readonly approvePairingRequest: (
    requestId: string,
  ) => Effect.Effect<AnnotationsBridgePairingStatusResult>;
  readonly rejectPairingRequest: (
    requestId: string,
  ) => Effect.Effect<{ readonly rejected: boolean }>;
  readonly listClients: Effect.Effect<ReadonlyArray<AnnotationsBridgeClient>>;
  readonly revokeClient: (clientId: string) => Effect.Effect<{ readonly revoked: boolean }>;
  readonly authenticateToken: (
    token: string | null,
  ) => Effect.Effect<AuthenticatedAnnotationsBridgeClient | null>;
  readonly getStatus: (
    client: AuthenticatedAnnotationsBridgeClient,
  ) => Effect.Effect<AnnotationsBridgeStatus>;
  readonly deliver: (
    client: AuthenticatedAnnotationsBridgeClient,
    request: AnnotationsBridgeDeliverRequest,
  ) => Effect.Effect<AnnotationsBridgeDeliveryResult>;
}

export class AnnotationsBridge extends Context.Service<AnnotationsBridge, AnnotationsBridgeShape>()(
  "t3/annotationsBridge",
) {}

export const AnnotationsBridgeLive = Layer.effect(
  AnnotationsBridge,
  Effect.gen(function* () {
    const secretStore = yield* ServerSecretStore;
    const serverSettings = yield* ServerSettingsService;
    const serverAuth = yield* EnvironmentAuth;
    const composerIntake = yield* ExternalComposerIntake;
    const fileSystem = yield* FileSystem.FileSystem;
    const pendingPairingsRef = yield* Ref.make(new Map<string, PendingPairingRecord>());
    const pairingRateLimitRef = yield* Ref.make(new Map<string, ReadonlyArray<number>>());
    const tokenPepper = yield* secretStore.getOrCreateRandom(TOKEN_HASH_PEPPER_SECRET, 32);

    const tokenHash = (token: string) =>
      crypto.createHmac("sha256", Buffer.from(tokenPepper)).update(token).digest("base64url");

    const loadClientRecords: Effect.Effect<BridgeClientRecord[]> = Effect.gen(function* () {
      const raw = yield* secretStore.get(CLIENTS_SECRET);
      if (!raw) return [] as BridgeClientRecord[];
      return yield* decodeBridgeClientRecordsJson(new TextDecoder().decode(raw)).pipe(
        Effect.map((records) => records as BridgeClientRecord[]),
      );
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Failed to read Annotations bridge clients", { error }).pipe(
          Effect.as([] as BridgeClientRecord[]),
        ),
      ),
    );

    const saveClientRecords = (records: ReadonlyArray<BridgeClientRecord>) =>
      encodeBridgeClientRecordsJson(records).pipe(
        Effect.flatMap((json) => secretStore.set(CLIENTS_SECRET, new TextEncoder().encode(json))),
        Effect.as(true),
        Effect.catch((error) =>
          Effect.logError("Failed to persist Annotations bridge clients", { error }).pipe(
            Effect.as(false),
          ),
        ),
      );

    const getBridgeSettings = serverSettings.getSettings.pipe(
      Effect.map((settings) => ({
        enabled: settings.annotationsBridge.enabled,
        allowRemoteClients: settings.annotationsBridge.allowRemoteClients,
      })),
      Effect.catch((error) =>
        Effect.logWarning("Failed to read Annotations bridge settings", { error }).pipe(
          Effect.as({ enabled: false, allowRemoteClients: false }),
        ),
      ),
    );

    const isRemoteBlocked = Effect.gen(function* () {
      const [settings, descriptor] = yield* Effect.all([
        getBridgeSettings,
        serverAuth.getDescriptor(),
      ]);
      return descriptor.policy === "remote-reachable" && !settings.allowRemoteClients;
    });

    const cleanupExpiredPairings = (now: number) =>
      Ref.update(pendingPairingsRef, (pending) => {
        const next = new Map(pending);
        for (const [requestId, request] of next) {
          if (request.expiresAtEpochMs <= now) {
            next.delete(requestId);
          }
        }
        return next;
      });

    const checkPairingRateLimit = (key: string, now: number) =>
      Ref.modify(pairingRateLimitRef, (rateLimits) => {
        const previous = rateLimits.get(key) ?? [];
        const recent = previous.filter(
          (timestamp) => now - timestamp <= PAIRING_RATE_LIMIT_WINDOW_MS,
        );
        const allowed = recent.length < PAIRING_RATE_LIMIT_MAX;
        const next = new Map(rateLimits);
        next.set(key, allowed ? [...recent, now] : recent);
        return [allowed, next] as const;
      });

    const listPublicClients = loadClientRecords.pipe(
      Effect.map((records) => records.map(stripClientRecordSecret)),
    );

    return AnnotationsBridge.of({
      getManifest: Effect.gen(function* () {
        const [settings, remoteBlocked] = yield* Effect.all([getBridgeSettings, isRemoteBlocked]);
        return {
          protocolVersion: ANNOTATIONS_BRIDGE_PROTOCOL_VERSION,
          appVersion: process.env.npm_package_version ?? "0.0.24",
          pairingRequired: true,
          bridgeEnabled: settings.enabled,
          status: remoteBlocked ? "remote-blocked" : settings.enabled ? "ready" : "disabled",
        } satisfies AnnotationsBridgeManifest;
      }),

      createPairingRequest: ({ payload, origin, userAgent }) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* cleanupExpiredPairings(now);

          if (yield* isRemoteBlocked) {
            return {
              ok: false,
              reason: "remote-bridge-disabled",
              message: "Annotations bridge is disabled while T3 Code is network-reachable.",
            } satisfies AnnotationsBridgePairingRequestResult;
          }

          const settings = yield* getBridgeSettings;
          if (!settings.enabled) {
            return {
              ok: false,
              reason: "bridge-disabled",
              message: "Annotations bridge is disabled in T3 Code.",
            } satisfies AnnotationsBridgePairingRequestResult;
          }

          if (!origin || !isChromeExtensionOrigin(origin)) {
            return {
              ok: false,
              reason: "unauthorized",
              message: "Pairing requests must originate from a Chrome extension.",
            } satisfies AnnotationsBridgePairingRequestResult;
          }

          const rateLimitKey = `${origin}:${payload.clientInstallId}`;
          const allowed = yield* checkPairingRateLimit(rateLimitKey, now);
          if (!allowed) {
            return {
              ok: false,
              reason: "pairing-rate-limited",
              message: "Too many Annotations pairing attempts. Try again shortly.",
            } satisfies AnnotationsBridgePairingRequestResult;
          }

          const requestId = crypto.randomUUID();
          const pollSecret = crypto.randomBytes(32).toString("base64url");
          const expiresAtEpochMs = now + PAIRING_TTL_MS;
          const request: PendingPairingRecord = {
            requestId,
            clientInstallId: payload.clientInstallId,
            clientName: payload.clientName ?? "Annotations",
            extensionId: payload.extensionId ?? readChromeExtensionOriginId(origin),
            origin,
            browser: payload.browser ?? userAgent,
            createdAtEpochMs: now,
            expiresAtEpochMs,
            pollSecretHash: tokenHash(pollSecret),
            status: "pending",
            approvedClientId: null,
            approvedToken: null,
          };

          yield* Ref.update(pendingPairingsRef, (pending) => {
            const next = new Map(pending);
            next.set(requestId, request);
            return next;
          });

          yield* Effect.logInfo("Annotations bridge pairing requested", {
            requestId,
            clientInstallId: payload.clientInstallId,
            extensionId: request.extensionId,
            origin,
            expiresAtEpochMs,
          });

          return {
            ok: true,
            requestId,
            pollSecret,
            status: "pending",
            expiresAtEpochMs,
          } satisfies AnnotationsBridgePairingRequestResult;
        }),

      readPairingStatus: (input) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* cleanupExpiredPairings(now);
          const pending = yield* Ref.get(pendingPairingsRef);
          const request = pending.get(input.requestId);
          if (!request) {
            return {
              ok: false,
              status: "expired",
              reason: "pairing-expired",
            } satisfies AnnotationsBridgePairingStatusResult;
          }
          if (!timingSafeEqual(request.pollSecretHash, tokenHash(input.pollSecret))) {
            return {
              ok: false,
              status: "rejected",
              reason: "unauthorized",
            } satisfies AnnotationsBridgePairingStatusResult;
          }
          if (request.status === "rejected") {
            return {
              ok: false,
              status: "rejected",
              reason: "pairing-rejected",
            } satisfies AnnotationsBridgePairingStatusResult;
          }
          if (request.status === "approved" && request.approvedClientId && request.approvedToken) {
            yield* Ref.update(pendingPairingsRef, (pendingPairings) => {
              const next = new Map(pendingPairings);
              next.delete(input.requestId);
              return next;
            });
            return {
              ok: true,
              status: "approved",
              clientId: request.approvedClientId,
              token: request.approvedToken,
            } satisfies AnnotationsBridgePairingStatusResult;
          }
          return {
            ok: false,
            status: "pending",
            reason: "pairing-pending",
          } satisfies AnnotationsBridgePairingStatusResult;
        }),

      listPendingPairingRequests: Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* cleanupExpiredPairings(now);
        const pending = yield* Ref.get(pendingPairingsRef);
        return [...pending.values()]
          .filter((request) => request.status === "pending")
          .map(stripPendingPairingSecret);
      }),

      approvePairingRequest: (requestId) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* cleanupExpiredPairings(now);
          const pending = yield* Ref.get(pendingPairingsRef);
          const request = pending.get(requestId);
          if (!request || request.status !== "pending") {
            return {
              ok: false,
              status: "expired",
              reason: "pairing-expired",
            } satisfies AnnotationsBridgePairingStatusResult;
          }

          const token = `t3ab_${crypto.randomBytes(32).toString("base64url")}`;
          const clientId = crypto.randomUUID();
          const record: BridgeClientRecord = {
            clientId,
            clientInstallId: request.clientInstallId,
            clientName: request.clientName,
            extensionId: request.extensionId,
            origin: request.origin,
            browser: request.browser,
            createdAtEpochMs: now,
            lastSeenAtEpochMs: null,
            revokedAtEpochMs: null,
            tokenHash: tokenHash(token),
          };
          const records = yield* loadClientRecords;
          const saved = yield* saveClientRecords(
            addApprovedBridgeClientRecord(records, record, now),
          );
          if (!saved) {
            return {
              ok: false,
              status: "rejected",
              reason: "delivery-failed",
              message: "Could not persist Annotations bridge client.",
            } satisfies AnnotationsBridgePairingStatusResult;
          }
          yield* Ref.update(pendingPairingsRef, (pendingPairings) => {
            const next = new Map(pendingPairings);
            next.set(requestId, {
              ...request,
              status: "approved",
              approvedClientId: clientId,
              approvedToken: token,
            });
            return next;
          });
          return {
            ok: true,
            status: "approved",
            clientId,
            token,
          } satisfies AnnotationsBridgePairingStatusResult;
        }),

      rejectPairingRequest: (requestId) =>
        Ref.modify(
          pendingPairingsRef,
          (
            pending,
          ): readonly [{ readonly rejected: boolean }, Map<string, PendingPairingRecord>] => {
            const request = pending.get(requestId);
            if (!request || request.status !== "pending") {
              return [{ rejected: false }, pending] as const;
            }
            const next = new Map(pending);
            next.set(requestId, { ...request, status: "rejected" });
            return [{ rejected: true }, next] as const;
          },
        ),

      listClients: listPublicClients,

      revokeClient: (clientId) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const records = yield* loadClientRecords;
          let revoked = false;
          const nextRecords: BridgeClientRecord[] = [];
          for (const client of records) {
            if (client.clientId !== clientId || client.revokedAtEpochMs !== null) {
              nextRecords.push(client);
              continue;
            }
            revoked = true;
            nextRecords.push({ ...client, revokedAtEpochMs: now });
          }
          if (revoked) {
            revoked = yield* saveClientRecords(nextRecords);
          }
          return { revoked };
        }),

      authenticateToken: (token) =>
        Effect.gen(function* () {
          if (!token) return null;
          const hash = tokenHash(token);
          const now = yield* Clock.currentTimeMillis;
          const records = yield* loadClientRecords;
          const record = records.find(
            (candidate) =>
              candidate.revokedAtEpochMs === null && timingSafeEqual(candidate.tokenHash, hash),
          );
          if (!record) return null;
          const nextRecord = { ...record, lastSeenAtEpochMs: now };
          yield* saveClientRecords(
            records.map((candidate) =>
              candidate.clientId === record.clientId ? nextRecord : candidate,
            ),
          );
          return {
            token,
            client: stripClientRecordSecret(nextRecord),
          } satisfies AuthenticatedAnnotationsBridgeClient;
        }),

      getStatus: (_client) =>
        Effect.gen(function* () {
          const settings = yield* getBridgeSettings;
          const now = yield* Clock.currentTimeMillis;
          if (!settings.enabled) {
            return {
              ok: true,
              connected: false,
              reason: "bridge-disabled",
              checkedAtEpochMs: now,
              target: null,
            } satisfies AnnotationsBridgeStatus;
          }
          if (yield* isRemoteBlocked) {
            return {
              ok: false,
              reason: "remote-bridge-disabled",
              message: "Annotations bridge is blocked while T3 Code is network-reachable.",
            } satisfies AnnotationsBridgeStatus;
          }
          const status = yield* composerIntake.getStatus;
          if (!status.connected) {
            return {
              ok: true,
              connected: false,
              reason: "no-active-composer",
              checkedAtEpochMs: status.checkedAtEpochMs,
              target: null,
            } satisfies AnnotationsBridgeStatus;
          }
          return {
            ok: true,
            connected: true,
            reason: null,
            checkedAtEpochMs: status.checkedAtEpochMs,
            target: status.target,
          } satisfies AnnotationsBridgeStatus;
        }),

      deliver: (_client, request) =>
        Effect.gen(function* () {
          const settings = yield* getBridgeSettings;
          if (!settings.enabled) {
            return {
              ok: false,
              requestId: request.requestId,
              reason: "bridge-disabled",
            } satisfies AnnotationsBridgeDeliveryResult;
          }
          if (yield* isRemoteBlocked) {
            return {
              ok: false,
              requestId: request.requestId,
              reason: "remote-bridge-disabled",
            } satisfies AnnotationsBridgeDeliveryResult;
          }
          const imageValidation = yield* validateBridgeImage(fileSystem, request);
          if (!imageValidation.ok) {
            return {
              ok: false,
              requestId: request.requestId,
              reason: "invalid-payload",
              message: imageValidation.message,
            } satisfies AnnotationsBridgeDeliveryResult;
          }

          const delivery = yield* composerIntake.publish(toExternalComposerIntakeRequest(request));
          if (!delivery.ok) {
            return {
              ok: false,
              requestId: request.requestId,
              reason: delivery.reason,
            } satisfies AnnotationsBridgeDeliveryResult;
          }
          return {
            ok: true,
            requestId: request.requestId,
          } satisfies AnnotationsBridgeDeliveryResult;
        }),
    });
  }),
);

function stripClientRecordSecret(record: BridgeClientRecord): AnnotationsBridgeClient {
  const { tokenHash: _tokenHash, ...client } = record;
  return client;
}

function stripPendingPairingSecret(
  record: PendingPairingRecord,
): AnnotationsBridgePendingPairingRequest {
  const {
    pollSecretHash: _pollSecretHash,
    status: _status,
    approvedClientId: _approvedClientId,
    approvedToken: _approvedToken,
    ...request
  } = record;
  return request;
}

function isChromeExtensionOrigin(origin: string): boolean {
  return /^chrome-extension:\/\/[a-p]{32}$/u.test(origin.trim());
}

function readChromeExtensionOriginId(origin: string): string | null {
  const match = /^chrome-extension:\/\/([a-p]{32})$/u.exec(origin.trim());
  return match?.[1] ?? null;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function toExternalComposerIntakeRequest(
  request: AnnotationsBridgeDeliverRequest,
): ExternalComposerIntakeRequest {
  return {
    type: EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
    requestId: request.requestId,
    source: "annotations",
    action: request.action ?? "insert",
    prompt: request.prompt,
    append: request.append ?? true,
    focus: request.focus ?? true,
    image: request.image,
  };
}

export function validateBridgeImage(
  fileSystem: FileSystem.FileSystem,
  request: AnnotationsBridgeDeliverRequest,
): Effect.Effect<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
  return Effect.gen(function* () {
    if (request.type !== ANNOTATIONS_BRIDGE_DELIVER_REQUEST_TYPE) {
      return { ok: false, message: "Unsupported Annotations bridge request type." };
    }
    const image = request.image;
    if (!image) return { ok: true };
    if (image.mimeType !== undefined && image.mimeType !== "image/png") {
      return { ok: false, message: "Annotations bridge only accepts PNG images." };
    }
    if (!isAnnotationsBridgeImagePngName(image)) {
      return { ok: false, message: "Annotations bridge image must be named as a PNG file." };
    }
    if (image.sizeBytes !== undefined && image.sizeBytes > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Annotations bridge image is too large." };
    }

    const stat = yield* fileSystem.stat(image.path).pipe(
      Effect.map(Option.some),
      Effect.catch(() => Effect.succeed(Option.none())),
    );
    if (Option.isNone(stat)) {
      yield* Effect.logWarning("Annotations bridge could not stat image file", {
        requestId: request.requestId,
        imageName: image.name ?? null,
      });
      return { ok: false, message: "Annotations bridge image file was not found." };
    }
    if (stat.value.type !== "File") {
      return { ok: false, message: "Annotations bridge image file was not found." };
    }
    if (stat.value.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Annotations bridge image file is too large." };
    }
    return { ok: true };
  });
}

export function isAnnotationsBridgeImagePngName(
  image: NonNullable<AnnotationsBridgeDeliverRequest["image"]>,
): boolean {
  return (
    image.path.toLowerCase().endsWith(".png") ||
    (image.name?.toLowerCase().endsWith(".png") ?? false)
  );
}

export function addApprovedBridgeClientRecord(
  records: ReadonlyArray<BridgeClientRecord>,
  record: BridgeClientRecord,
  revokedAtEpochMs: number,
): ReadonlyArray<BridgeClientRecord> {
  return [
    ...records.map((client) =>
      client.clientInstallId === record.clientInstallId &&
      client.revokedAtEpochMs === null &&
      client.clientId !== record.clientId
        ? { ...client, revokedAtEpochMs }
        : client,
    ),
    record,
  ];
}
