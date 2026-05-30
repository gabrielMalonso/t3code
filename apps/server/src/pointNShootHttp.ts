import { POINTNSHOOT_EXTENSION_ID, PointNShootComposerIntakeRequest } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { browserApiCorsHeaders } from "./httpCors.ts";
import { PointNShootComposerIntake } from "./pointNShootComposerIntake.ts";

const pointNShootCorsHeaders = {
  ...browserApiCorsHeaders,
  "access-control-allow-private-network": "true",
} as const;

const PointNShootRequestHeaders = Schema.Struct({
  origin: Schema.optionalKey(Schema.String),
  "x-annotations-extension-id": Schema.optionalKey(Schema.String),
  "x-pointnshoot-extension-id": Schema.optionalKey(Schema.String),
});

function isAllowedPointNShootRequest(headers: typeof PointNShootRequestHeaders.Type): boolean {
  const origin = headers.origin?.trim();
  const extensionId =
    headers["x-annotations-extension-id"]?.trim() ?? headers["x-pointnshoot-extension-id"]?.trim();

  if (origin) {
    const originExtensionId = readChromeExtensionOriginId(origin);
    return (
      originExtensionId === POINTNSHOOT_EXTENSION_ID &&
      (extensionId === undefined || extensionId === POINTNSHOOT_EXTENSION_ID)
    );
  }

  return extensionId === POINTNSHOOT_EXTENSION_ID;
}

function readChromeExtensionOriginId(origin: string): string | null {
  const match = /^chrome-extension:\/\/([a-p]{32})$/u.exec(origin);
  return match?.[1] ?? null;
}

function composerIntakeJson(body: unknown, status: number) {
  return HttpServerResponse.jsonUnsafe(body, {
    status,
    headers: pointNShootCorsHeaders,
  });
}

function readPointNShootRequestHeaders() {
  return HttpServerRequest.schemaHeaders(PointNShootRequestHeaders).pipe(
    Effect.catch(() => Effect.succeed({} as typeof PointNShootRequestHeaders.Type)),
  );
}

function forbiddenPointNShootResponse() {
  return composerIntakeJson(
    {
      ok: false,
      reason: "annotations-extension-not-allowed",
    },
    403,
  );
}

const emptyComposerIntakeOptionsResponse = Effect.succeed(
  HttpServerResponse.empty({ status: 204, headers: pointNShootCorsHeaders }),
);

const handleComposerIntakeStatusGet = Effect.gen(function* () {
  const headers = yield* readPointNShootRequestHeaders();
  if (!isAllowedPointNShootRequest(headers)) {
    return forbiddenPointNShootResponse();
  }

  const intake = yield* PointNShootComposerIntake;
  const status = yield* intake.getStatus;
  return composerIntakeJson(status, 200);
});

const handleComposerIntakePost = Effect.gen(function* () {
  const headers = yield* readPointNShootRequestHeaders();

  if (!isAllowedPointNShootRequest(headers)) {
    return forbiddenPointNShootResponse();
  }

  const intake = yield* PointNShootComposerIntake;
  const hasSubscribers = yield* intake.hasActiveSubscribers;
  if (!hasSubscribers) {
    yield* Effect.logWarning("Annotations composer intake rejected", {
      reason: "composer-not-connected",
    });
    return composerIntakeJson(
      {
        ok: false,
        reason: "composer-not-connected",
      },
      409,
    );
  }

  const payload = yield* HttpServerRequest.schemaBodyJson(PointNShootComposerIntakeRequest).pipe(
    Effect.mapError((cause) => ({
      message: "Invalid Annotations composer intake payload.",
      cause,
    })),
  );

  const delivered = yield* intake.publish(payload);
  if (!delivered) {
    yield* Effect.logWarning("Annotations composer intake rejected", {
      requestId: payload.requestId,
      reason: "composer-not-connected",
    });
    return composerIntakeJson(
      {
        ok: false,
        reason: "composer-not-connected",
      },
      409,
    );
  }

  yield* Effect.logInfo("Annotations composer intake delivered", {
    requestId: payload.requestId,
    imagePath: payload.image?.path ?? null,
  });

  return composerIntakeJson(
    {
      ok: true,
      requestId: payload.requestId,
    },
    200,
  );
}).pipe(
  Effect.catch((error: unknown) =>
    Effect.succeed(
      composerIntakeJson(
        {
          ok: false,
          reason: "annotations-intake-failed",
          message:
            typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : "Annotations composer intake failed.",
        },
        400,
      ),
    ),
  ),
);

const annotationsComposerIntakeOptionsRouteLayer = HttpRouter.add(
  "OPTIONS",
  "/api/annotations/composer-intake",
  emptyComposerIntakeOptionsResponse,
);

const annotationsComposerIntakeStatusOptionsRouteLayer = HttpRouter.add(
  "OPTIONS",
  "/api/annotations/composer-intake/status",
  emptyComposerIntakeOptionsResponse,
);

const annotationsComposerIntakeStatusGetRouteLayer = HttpRouter.add(
  "GET",
  "/api/annotations/composer-intake/status",
  handleComposerIntakeStatusGet,
);

const annotationsComposerIntakePostRouteLayer = HttpRouter.add(
  "POST",
  "/api/annotations/composer-intake",
  handleComposerIntakePost,
);

const pointNShootComposerIntakeOptionsRouteLayer = HttpRouter.add(
  "OPTIONS",
  "/api/pointnshoot/composer-intake",
  emptyComposerIntakeOptionsResponse,
);

const pointNShootComposerIntakeStatusOptionsRouteLayer = HttpRouter.add(
  "OPTIONS",
  "/api/pointnshoot/composer-intake/status",
  emptyComposerIntakeOptionsResponse,
);

const pointNShootComposerIntakeStatusGetRouteLayer = HttpRouter.add(
  "GET",
  "/api/pointnshoot/composer-intake/status",
  handleComposerIntakeStatusGet,
);

const pointNShootComposerIntakePostRouteLayer = HttpRouter.add(
  "POST",
  "/api/pointnshoot/composer-intake",
  handleComposerIntakePost,
);

export const pointNShootComposerIntakeRouteLayer = Layer.mergeAll(
  annotationsComposerIntakeOptionsRouteLayer,
  annotationsComposerIntakeStatusOptionsRouteLayer,
  annotationsComposerIntakeStatusGetRouteLayer,
  annotationsComposerIntakePostRouteLayer,
  pointNShootComposerIntakeOptionsRouteLayer,
  pointNShootComposerIntakeStatusOptionsRouteLayer,
  pointNShootComposerIntakeStatusGetRouteLayer,
  pointNShootComposerIntakePostRouteLayer,
);
