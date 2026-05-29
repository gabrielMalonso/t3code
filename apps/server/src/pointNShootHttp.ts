import {
  POINTNSHOOT_EXTENSION_ID,
  POINTNSHOOT_EXTENSION_ORIGIN,
  PointNShootComposerIntakeRequest,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { browserApiCorsHeaders } from "./httpCors.ts";
import { PointNShootComposerIntake } from "./pointNShootComposerIntake.ts";
import { ServerSettingsService } from "./serverSettings.ts";

const pointNShootCorsHeaders = {
  ...browserApiCorsHeaders,
  "access-control-allow-headers": `${browserApiCorsHeaders["access-control-allow-headers"]}, x-pointnshoot-extension-id`,
} as const;

const PointNShootRequestHeaders = Schema.Struct({
  origin: Schema.optionalKey(Schema.String),
  "x-pointnshoot-extension-id": Schema.optionalKey(Schema.String),
});

function isAllowedPointNShootRequest(headers: typeof PointNShootRequestHeaders.Type): boolean {
  const origin = headers.origin?.trim();
  const extensionId = headers["x-pointnshoot-extension-id"]?.trim();

  if (origin === POINTNSHOOT_EXTENSION_ORIGIN) {
    return true;
  }

  return origin === undefined && extensionId === POINTNSHOOT_EXTENSION_ID;
}

function composerIntakeJson(body: unknown, status: number) {
  return HttpServerResponse.jsonUnsafe(body, {
    status,
    headers: pointNShootCorsHeaders,
  });
}

export const pointNShootComposerIntakeRouteLayer = HttpRouter.add(
  "POST",
  "/api/pointnshoot/composer-intake",
  Effect.gen(function* () {
    const headers = yield* HttpServerRequest.schemaHeaders(PointNShootRequestHeaders).pipe(
      Effect.catch(() => Effect.succeed({} as typeof PointNShootRequestHeaders.Type)),
    );

    if (!isAllowedPointNShootRequest(headers)) {
      return composerIntakeJson(
        {
          ok: false,
          reason: "pointnshoot-extension-not-allowed",
        },
        403,
      );
    }

    const serverSettings = yield* ServerSettingsService;
    const settings = yield* serverSettings.getSettings;
    if (!settings.pointNShootBridgeEnabled) {
      return composerIntakeJson(
        {
          ok: false,
          reason: "pointnshoot-bridge-disabled",
        },
        403,
      );
    }

    const intake = yield* PointNShootComposerIntake;
    const hasSubscribers = yield* intake.hasActiveSubscribers;
    if (!hasSubscribers) {
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
        message: "Invalid PointNShoot composer intake payload.",
        cause,
      })),
    );

    yield* intake.publish(payload);
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
            reason: "pointnshoot-intake-failed",
            message:
              typeof error === "object" && error !== null && "message" in error
                ? String(error.message)
                : "PointNShoot composer intake failed.",
          },
          400,
        ),
      ),
    ),
  ),
);
