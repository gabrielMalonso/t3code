import type { ProviderRuntimeEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import {
  type OpenPetsNotifyInput,
  OpenPetsBridge,
} from "../../openpets/Services/OpenPetsBridge.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { OpenPetsReactor, type OpenPetsReactorShape } from "../Services/OpenPetsReactor.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const DEFAULT_TITLE = "T3 Code";
const MAX_TITLE_LENGTH = 80;
const MAX_TEXT_LENGTH = 180;
const MAX_TEXT_BUFFER_LENGTH = MAX_TEXT_LENGTH * 2;
const MAX_THREAD_RECORDS = 1_000;
const CONTENT_NOTIFY_INTERVAL_MS = 2_000;
const MIN_CONTENT_NOTIFY_CHARS = 32;

interface OpenPetsContentProgress {
  readonly assistantSnippet: string;
  readonly reasoningSummarySnippet: string;
  readonly assistantLastNotifiedAtMs: number;
  readonly reasoningSummaryLastNotifiedAtMs: number;
}

interface OpenPetsReactorState {
  readonly titles: Map<string, string>;
  readonly content: Map<string, OpenPetsContentProgress>;
}

const initialState: OpenPetsReactorState = {
  titles: new Map(),
  content: new Map(),
};

function notificationKey(event: ProviderRuntimeEvent): string {
  return String(event.threadId);
}

function requestTypeLabel(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shortText(value: string, limit = MAX_TEXT_LENGTH): string {
  const compacted = compactText(value);
  return truncate(compacted.length > 0 ? compacted : "Status updated.", limit);
}

function tailText(value: string): string {
  const compacted = compactText(value);
  return truncate(
    compacted.slice(Math.max(0, compacted.length - MAX_TEXT_LENGTH)),
    MAX_TEXT_LENGTH,
  );
}

function appendBoundedTail(previous: string, delta: string): string {
  const compacted = compactText(`${previous}${delta}`);
  return compacted.slice(Math.max(0, compacted.length - MAX_TEXT_BUFFER_LENGTH));
}

function setBoundedMapEntry<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
): Map<TKey, TValue> {
  const next = new Map(map);
  next.delete(key);
  next.set(key, value);
  while (next.size > MAX_THREAD_RECORDS) {
    const oldestKey = next.keys().next().value as TKey | undefined;
    if (oldestKey === undefined) {
      break;
    }
    next.delete(oldestKey);
  }
  return next;
}

function completionText(event: Extract<ProviderRuntimeEvent, { type: "turn.completed" }>): string {
  if (event.payload.state === "completed") {
    return "Completed.";
  }
  return event.payload.errorMessage ?? `Turn ${event.payload.state}.`;
}

function planText(event: Extract<ProviderRuntimeEvent, { type: "turn.plan.updated" }>): string {
  const activeStep =
    event.payload.plan.find((step) => step.status === "inProgress") ??
    event.payload.plan.find((step) => step.status === "pending") ??
    event.payload.plan.at(-1);
  return activeStep ? `Plan: ${activeStep.step}.` : (event.payload.explanation ?? "Plan updated.");
}

function eventToNotification(
  event: ProviderRuntimeEvent,
  title = DEFAULT_TITLE,
): OpenPetsNotifyInput | null {
  const key = notificationKey(event);
  switch (event.type) {
    case "turn.started":
      return {
        key,
        title,
        status: "running",
        text: "Working on this chat.",
      };
    case "turn.plan.updated":
      return {
        key,
        title,
        status: "running",
        text: shortText(planText(event)),
      };
    case "request.opened":
      return {
        key,
        title,
        status: "review",
        text: shortText(
          `Approval needed: ${event.payload.detail ?? requestTypeLabel(event.payload.requestType)}.`,
        ),
      };
    case "user-input.requested":
      return {
        key,
        title,
        status: "waiting",
        text: shortText(
          event.payload.questions[0]?.question
            ? `Waiting for your input: ${event.payload.questions[0].question}`
            : "Waiting for your input.",
        ),
      };
    case "request.resolved":
    case "user-input.resolved":
      return {
        key,
        title,
        status: "running",
        text: "Back to work.",
      };
    case "turn.completed":
      return {
        key,
        title,
        status: event.payload.state === "completed" ? "done" : "failed",
        text: shortText(completionText(event)),
      };
    case "turn.aborted":
      return {
        key,
        title,
        status: "failed",
        text: shortText(event.payload.reason),
      };
    case "runtime.error":
      return {
        key,
        title,
        status: "failed",
        text: shortText(event.payload.message),
      };
    default:
      return null;
  }
}

const make = Effect.gen(function* () {
  const providerService = yield* ProviderService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const openPets = yield* OpenPetsBridge;
  const stateRef = yield* Ref.make<OpenPetsReactorState>(initialState);

  const resolveTitle = (event: ProviderRuntimeEvent) =>
    Effect.gen(function* () {
      const threadKey = String(event.threadId);
      if (event.type === "thread.metadata.updated" && event.payload.name) {
        const title = truncate(event.payload.name, MAX_TITLE_LENGTH);
        yield* Ref.update(stateRef, (state) => {
          return {
            ...state,
            titles: setBoundedMapEntry(state.titles, threadKey, title),
          };
        });
        return title;
      }

      const state = yield* Ref.get(stateRef);
      const cached = state.titles.get(threadKey);
      if (cached) {
        return cached;
      }

      const title = yield* projectionSnapshotQuery.getThreadShellById(event.threadId).pipe(
        Effect.map((thread) =>
          Option.match(thread, {
            onNone: () => DEFAULT_TITLE,
            onSome: (value) => truncate(value.title, MAX_TITLE_LENGTH),
          }),
        ),
        Effect.catch(() => Effect.succeed(DEFAULT_TITLE)),
      );

      if (title !== DEFAULT_TITLE) {
        yield* Ref.update(stateRef, (current) => {
          return {
            ...current,
            titles: setBoundedMapEntry(current.titles, threadKey, title),
          };
        });
      }
      return title;
    });

  const contentNotification = (event: Extract<ProviderRuntimeEvent, { type: "content.delta" }>) =>
    Effect.gen(function* () {
      if (
        event.payload.streamKind !== "assistant_text" &&
        event.payload.streamKind !== "reasoning_summary_text"
      ) {
        return null;
      }

      const nowMs = yield* Clock.currentTimeMillis;
      return yield* Ref.modify(stateRef, (state) => {
        const key = notificationKey(event);
        const previous = state.content.get(key) ?? {
          assistantSnippet: "",
          reasoningSummarySnippet: "",
          assistantLastNotifiedAtMs: 0,
          reasoningSummaryLastNotifiedAtMs: 0,
        };
        const isAssistantText = event.payload.streamKind === "assistant_text";
        const nextProgress: OpenPetsContentProgress = isAssistantText
          ? {
              ...previous,
              assistantSnippet: appendBoundedTail(previous.assistantSnippet, event.payload.delta),
            }
          : {
              ...previous,
              reasoningSummarySnippet: appendBoundedTail(
                previous.reasoningSummarySnippet,
                event.payload.delta,
              ),
            };
        const sourceText = isAssistantText
          ? nextProgress.assistantSnippet
          : nextProgress.reasoningSummarySnippet;
        const snippet = tailText(sourceText);
        const lastNotifiedAtMs = isAssistantText
          ? previous.assistantLastNotifiedAtMs
          : previous.reasoningSummaryLastNotifiedAtMs;
        const shouldNotify =
          snippet.length >= MIN_CONTENT_NOTIFY_CHARS &&
          (lastNotifiedAtMs === 0 || nowMs - lastNotifiedAtMs >= CONTENT_NOTIFY_INTERVAL_MS);
        const content = setBoundedMapEntry(state.content, key, {
          ...nextProgress,
          assistantLastNotifiedAtMs:
            shouldNotify && isAssistantText ? nowMs : previous.assistantLastNotifiedAtMs,
          reasoningSummaryLastNotifiedAtMs:
            shouldNotify && !isAssistantText ? nowMs : previous.reasoningSummaryLastNotifiedAtMs,
        });
        const text = shouldNotify ? snippet : null;
        return [text, { ...state, content }] as const;
      });
    });

  const clearContentForThread = (event: ProviderRuntimeEvent) =>
    Ref.update(stateRef, (state) => {
      const content = new Map(state.content);
      content.delete(notificationKey(event));
      return { ...state, content };
    });

  const processEvent = (event: ProviderRuntimeEvent) =>
    Effect.gen(function* () {
      const title = yield* resolveTitle(event);
      if (event.type === "content.delta") {
        const text = yield* contentNotification(event);
        if (text === null) {
          return;
        }
        yield* openPets.notify({
          key: notificationKey(event),
          title,
          status: "running",
          text,
        });
        return;
      }

      const notification = eventToNotification(event, title);
      if (notification === null) {
        return;
      }
      yield* openPets.notify(notification);
      if (
        event.type === "turn.completed" ||
        event.type === "turn.aborted" ||
        event.type === "runtime.error"
      ) {
        yield* clearContentForThread(event);
      }
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
