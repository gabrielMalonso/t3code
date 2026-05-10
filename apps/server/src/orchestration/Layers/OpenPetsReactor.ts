import type { ProviderRuntimeEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  type OpenPetsNotifyInput,
  OpenPetsBridge,
} from "../../openpets/Services/OpenPetsBridge.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { OpenPetsReactor, type OpenPetsReactorShape } from "../Services/OpenPetsReactor.ts";

function notificationKey(event: ProviderRuntimeEvent): string {
  if (event.turnId) {
    return `${event.threadId}:${event.turnId}`;
  }
  if (event.requestId) {
    return `${event.threadId}:request:${event.requestId}`;
  }
  return `${event.threadId}:event:${event.eventId}`;
}

function requestTypeLabel(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function completionText(event: Extract<ProviderRuntimeEvent, { type: "turn.completed" }>): string {
  if (event.payload.state === "completed") {
    return "Completed.";
  }
  return event.payload.errorMessage ?? `Turn ${event.payload.state}.`;
}

function eventToNotification(event: ProviderRuntimeEvent): OpenPetsNotifyInput | null {
  const key = notificationKey(event);
  switch (event.type) {
    case "turn.started":
      return {
        key,
        title: "T3 Code",
        status: "running",
        text: "T3 Code is working on this thread.",
      };
    case "request.opened":
      return {
        key,
        title: "T3 Code",
        status: "review",
        text: `Approval needed: ${requestTypeLabel(event.payload.requestType)}.`,
      };
    case "user-input.requested":
      return {
        key,
        title: "T3 Code",
        status: "waiting",
        text: "Waiting for your input.",
      };
    case "request.resolved":
    case "user-input.resolved":
      return {
        key,
        title: "T3 Code",
        status: "running",
        text: "Back to work.",
      };
    case "turn.completed":
      return {
        key,
        title: "T3 Code",
        status: event.payload.state === "completed" ? "done" : "failed",
        text: completionText(event),
      };
    case "turn.aborted":
      return {
        key,
        title: "T3 Code",
        status: "failed",
        text: event.payload.reason,
      };
    case "runtime.error":
      return {
        key,
        title: "T3 Code",
        status: "failed",
        text: event.payload.message,
      };
    default:
      return null;
  }
}

const make = Effect.gen(function* () {
  const providerService = yield* ProviderService;
  const openPets = yield* OpenPetsBridge;

  const processEvent = (event: ProviderRuntimeEvent) =>
    Effect.gen(function* () {
      const notification = eventToNotification(event);
      if (notification === null) {
        return;
      }
      yield* openPets.notify(notification);
    });

  const processEventSafely = (event: ProviderRuntimeEvent) =>
    processEvent(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning("OpenPets reactor failed to process runtime event", {
          eventId: event.eventId,
          eventType: event.type,
          threadId: event.threadId,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processEventSafely);

  const start: OpenPetsReactorShape["start"] = () =>
    Effect.asVoid(
      Effect.forkScoped(
        Stream.runForEach(providerService.streamEvents, (event) => worker.enqueue(event)),
      ),
    );

  return {
    start,
    drain: worker.drain,
  } satisfies OpenPetsReactorShape;
});

export const OpenPetsReactorLive = Layer.effect(OpenPetsReactor, make);

export const OpenPetsReactorInternals = {
  eventToNotification,
  notificationKey,
};
