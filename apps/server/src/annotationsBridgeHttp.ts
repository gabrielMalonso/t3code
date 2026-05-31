import {
  AnnotationsBridgeDeliverRequest,
  AnnotationsBridgePairingDecision,
  AnnotationsBridgePairingRequest,
  AnnotationsBridgePairingStatusRequest,
  AnnotationsBridgeRevokeClientRequest,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AuthError } from "./auth/Services/ServerAuth.ts";
import { ServerAuth } from "./auth/Services/ServerAuth.ts";
import { respondToAuthError } from "./auth/http.ts";
import { browserApiCorsHeaders } from "./httpCors.ts";
import {
  AnnotationsBridge,
  type AuthenticatedAnnotationsBridgeClient,
} from "./annotationsBridge.ts";

const annotationsBridgeCorsHeaders = {
  ...browserApiCorsHeaders,
  "access-control-allow-private-network": "true",
} as const;

const AnnotationsBridgeRequestHeaders = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
  origin: Schema.optionalKey(Schema.String),
  "user-agent": Schema.optionalKey(Schema.String),
});

function bridgeJson(body: unknown, status: number) {
  return HttpServerResponse.jsonUnsafe(body, {
    status,
    headers: annotationsBridgeCorsHeaders,
  });
}

function bridgeOptionsResponse() {
  return Effect.succeed(
    HttpServerResponse.empty({ status: 204, headers: annotationsBridgeCorsHeaders }),
  );
}

function readBridgeHeaders() {
  return HttpServerRequest.schemaHeaders(AnnotationsBridgeRequestHeaders).pipe(
    Effect.catch(() => Effect.succeed({} as typeof AnnotationsBridgeRequestHeaders.Type)),
  );
}

function readBearerToken(authorization: string | undefined): string | null {
  const trimmed = authorization?.trim();
  if (!trimmed) return null;
  const match = /^Bearer\s+(.+)$/iu.exec(trimmed);
  return match?.[1]?.trim() || null;
}

const authenticateBridgeClient = Effect.gen(function* () {
  const headers = yield* readBridgeHeaders();
  const bridge = yield* AnnotationsBridge;
  const token = readBearerToken(headers.authorization);
  const client = yield* bridge.authenticateToken(token);
  return {
    client,
    tokenPresent: token !== null,
  } as const;
});

function unauthenticatedBridgeResponse(tokenPresent: boolean) {
  return bridgeJson(
    {
      ok: false,
      reason: tokenPresent ? "unauthorized" : "not-paired",
    },
    401,
  );
}

function withBridgeClient<R>(
  run: (
    client: AuthenticatedAnnotationsBridgeClient,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, never, R>,
) {
  return Effect.gen(function* () {
    const { client, tokenPresent } = yield* authenticateBridgeClient;
    if (!client) return unauthenticatedBridgeResponse(tokenPresent);
    return yield* run(client);
  });
}

const requireOwnerSession = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  const session = yield* serverAuth.authenticateHttpRequest(request);
  if (session.role !== "owner") {
    return yield* new AuthError({
      message: "Only owner sessions can manage the Annotations bridge.",
      status: 403,
    });
  }
  return session;
});

const handleManifestGet = Effect.gen(function* () {
  const bridge = yield* AnnotationsBridge;
  const manifest = yield* bridge.getManifest;
  return bridgeJson(manifest, 200);
});

const handlePairingRequestPost = Effect.gen(function* () {
  const headers = yield* readBridgeHeaders();
  const bridge = yield* AnnotationsBridge;
  const payload = yield* HttpServerRequest.schemaBodyJson(AnnotationsBridgePairingRequest).pipe(
    Effect.catch(() => Effect.succeed(null as typeof AnnotationsBridgePairingRequest.Type | null)),
  );
  if (!payload) {
    return bridgeJson(
      {
        ok: false,
        reason: "invalid-payload",
      },
      400,
    );
  }

  const result = yield* bridge.createPairingRequest({
    payload,
    origin: headers.origin ?? null,
    userAgent: headers["user-agent"] ?? null,
  });
  return bridgeJson(result, result.ok ? 200 : result.reason === "pairing-rate-limited" ? 429 : 403);
});

const handlePairingStatusPost = Effect.gen(function* () {
  const bridge = yield* AnnotationsBridge;
  const payload = yield* HttpServerRequest.schemaBodyJson(
    AnnotationsBridgePairingStatusRequest,
  ).pipe(
    Effect.catch(() =>
      Effect.succeed(null as typeof AnnotationsBridgePairingStatusRequest.Type | null),
    ),
  );
  if (!payload) {
    return bridgeJson(
      {
        ok: false,
        status: "rejected",
        reason: "invalid-payload",
      },
      400,
    );
  }

  const result = yield* bridge.readPairingStatus(payload);
  return bridgeJson(result, result.ok ? 200 : result.reason === "unauthorized" ? 401 : 202);
});

const handleStatusGet = withBridgeClient((client) =>
  Effect.gen(function* () {
    const bridge = yield* AnnotationsBridge;
    const status = yield* bridge.getStatus(client);
    return bridgeJson(
      status,
      status.ok ? 200 : status.reason === "remote-bridge-disabled" ? 403 : 409,
    );
  }),
);

const handleDeliverPost = withBridgeClient((client) =>
  Effect.gen(function* () {
    const bridge = yield* AnnotationsBridge;
    const payload = yield* HttpServerRequest.schemaBodyJson(AnnotationsBridgeDeliverRequest).pipe(
      Effect.catch(() =>
        Effect.succeed(null as typeof AnnotationsBridgeDeliverRequest.Type | null),
      ),
    );
    if (!payload) {
      return bridgeJson(
        {
          ok: false,
          reason: "invalid-payload",
        },
        400,
      );
    }

    const result = yield* bridge.deliver(client, payload);
    return bridgeJson(result, result.ok ? 200 : bridgeDeliveryStatusCode(result.reason));
  }),
);

function bridgeDeliveryStatusCode(reason: string): number {
  switch (reason) {
    case "bridge-disabled":
    case "remote-bridge-disabled":
      return 403;
    case "invalid-payload":
      return 400;
    case "no-active-composer":
    case "delivery-timeout":
    case "delivery-failed":
      return 409;
    default:
      return 400;
  }
}

const handlePendingPairingsGet = Effect.gen(function* () {
  yield* requireOwnerSession;
  const bridge = yield* AnnotationsBridge;
  const requests = yield* bridge.listPendingPairingRequests;
  return bridgeJson(requests, 200);
}).pipe(Effect.catchTag("AuthError", respondToAuthError));

const handleApprovePairingPost = Effect.gen(function* () {
  yield* requireOwnerSession;
  const bridge = yield* AnnotationsBridge;
  const payload = yield* HttpServerRequest.schemaBodyJson(AnnotationsBridgePairingDecision).pipe(
    Effect.mapError(
      (cause) =>
        new AuthError({
          message: "Invalid Annotations bridge pairing approval payload.",
          status: 400,
          cause,
        }),
    ),
  );
  const result = yield* bridge.approvePairingRequest(payload.requestId);
  return bridgeJson(result, result.ok ? 200 : 404);
}).pipe(Effect.catchTag("AuthError", respondToAuthError));

const handleRejectPairingPost = Effect.gen(function* () {
  yield* requireOwnerSession;
  const bridge = yield* AnnotationsBridge;
  const payload = yield* HttpServerRequest.schemaBodyJson(AnnotationsBridgePairingDecision).pipe(
    Effect.mapError(
      (cause) =>
        new AuthError({
          message: "Invalid Annotations bridge pairing rejection payload.",
          status: 400,
          cause,
        }),
    ),
  );
  const result = yield* bridge.rejectPairingRequest(payload.requestId);
  return bridgeJson(result, 200);
}).pipe(Effect.catchTag("AuthError", respondToAuthError));

const handleClientsGet = Effect.gen(function* () {
  yield* requireOwnerSession;
  const bridge = yield* AnnotationsBridge;
  const clients = yield* bridge.listClients;
  return bridgeJson(clients, 200);
}).pipe(Effect.catchTag("AuthError", respondToAuthError));

const handleRevokeClientPost = Effect.gen(function* () {
  yield* requireOwnerSession;
  const bridge = yield* AnnotationsBridge;
  const payload = yield* HttpServerRequest.schemaBodyJson(
    AnnotationsBridgeRevokeClientRequest,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new AuthError({
          message: "Invalid Annotations bridge revoke payload.",
          status: 400,
          cause,
        }),
    ),
  );
  const result = yield* bridge.revokeClient(payload.clientId);
  return bridgeJson(result, 200);
}).pipe(Effect.catchTag("AuthError", respondToAuthError));

export const annotationsBridgeRouteLayer = Layer.mergeAll(
  HttpRouter.add("OPTIONS", "/api/annotations/bridge/manifest", bridgeOptionsResponse()),
  HttpRouter.add("GET", "/api/annotations/bridge/manifest", handleManifestGet),
  HttpRouter.add("OPTIONS", "/api/annotations/bridge/v1/pairing/request", bridgeOptionsResponse()),
  HttpRouter.add("POST", "/api/annotations/bridge/v1/pairing/request", handlePairingRequestPost),
  HttpRouter.add("OPTIONS", "/api/annotations/bridge/v1/pairing/status", bridgeOptionsResponse()),
  HttpRouter.add("POST", "/api/annotations/bridge/v1/pairing/status", handlePairingStatusPost),
  HttpRouter.add("OPTIONS", "/api/annotations/bridge/v1/status", bridgeOptionsResponse()),
  HttpRouter.add("GET", "/api/annotations/bridge/v1/status", handleStatusGet),
  HttpRouter.add("OPTIONS", "/api/annotations/bridge/v1/deliver", bridgeOptionsResponse()),
  HttpRouter.add("POST", "/api/annotations/bridge/v1/deliver", handleDeliverPost),
  HttpRouter.add("GET", "/api/annotations/bridge/v1/pairing/requests", handlePendingPairingsGet),
  HttpRouter.add("POST", "/api/annotations/bridge/v1/pairing/approve", handleApprovePairingPost),
  HttpRouter.add("POST", "/api/annotations/bridge/v1/pairing/reject", handleRejectPairingPost),
  HttpRouter.add("GET", "/api/annotations/bridge/v1/clients", handleClientsGet),
  HttpRouter.add("POST", "/api/annotations/bridge/v1/clients/revoke", handleRevokeClientPost),
);
