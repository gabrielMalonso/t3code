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
const CONTENT_NOTIFY_INTERVAL_MS = 2_000;
const MIN_CONTENT_NOTIFY_CHARS = 32;

interface OpenPetsContentProgress {
  readonly assistantText: string;
  readonly reasoningSummaryText: string;
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

function completionText(event: Extract<ProviderRuntimeEvent, { type: "turn.completed" }>): string {
  if (event.payload.state === "completed") {
    return "Completed.";
  }
  return event.payload.errorMessage ?? `Turn ${event.payload.state}.`;
}

function itemText(
  event: Extract<ProviderRuntimeEvent, { type: "item.started" | "item.completed" }>,
): string {
  const label = event.payload.title ?? requestTypeLabel(event.payload.itemType);
  const detail = event.payload.detail ? `: ${event.payload.detail}` : "";
  if (event.type === "item.completed") {
    return `Finished ${label}${detail}.`;
  }
  return `Working on ${label}${detail}.`;
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
    case "item.started":
    case "item.completed":
      if (
        event.payload.itemType === "assistant_message" ||
        event.payload.itemType === "reasoning" ||
        event.payload.itemType === "user_message" ||
        event.payload.itemType === "unknown"
      ) {
        return null;
      }
      return {
        key,
        title,
        status: "running",
        text: shortText(itemText(event)),
      };
    case "tool.progress":
      if (!event.payload.summary) {
        return null;
      }
      return {
        key,
        title,
        status: "running",
        text: shortText(event.payload.summary),
      };
    case "tool.summary":
      return {
        key,
        title,
        status: "running",
        text: shortText(event.payload.summary),
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
          const titles = new Map(state.titles);
          titles.set(threadKey, title);
          return { ...state, titles };
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
          const titles = new Map(current.titles);
          titles.set(threadKey, title);
          return { ...current, titles };
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
          assistantText: "",
          reasoningSummaryText: "",
          assistantLastNotifiedAtMs: 0,
          reasoningSummaryLastNotifiedAtMs: 0,
        };
        const isAssistantText = event.payload.streamKind === "assistant_text";
        const nextProgress: OpenPetsContentProgress = isAssistantText
          ? {
              ...previous,
              assistantText: previous.assistantText + event.payload.delta,
            }
          : {
              ...previous,
              reasoningSummaryText: previous.reasoningSummaryText + event.payload.delta,
            };
        const sourceText = isAssistantText
          ? nextProgress.assistantText
          : nextProgress.reasoningSummaryText;
        const snippet = tailText(sourceText);
        const lastNotifiedAtMs = isAssistantText
          ? previous.assistantLastNotifiedAtMs
          : previous.reasoningSummaryLastNotifiedAtMs;
        const shouldNotify =
          snippet.length >= MIN_CONTENT_NOTIFY_CHARS &&
          (lastNotifiedAtMs === 0 || nowMs - lastNotifiedAtMs >= CONTENT_NOTIFY_INTERVAL_MS);
        const content = new Map(state.content);
        content.set(key, {
          ...nextProgress,
          assistantLastNotifiedAtMs:
            shouldNotify && isAssistantText ? nowMs : previous.assistantLastNotifiedAtMs,
          reasoningSummaryLastNotifiedAtMs:
            shouldNotify && !isAssistantText ? nowMs : previous.reasoningSummaryLastNotifiedAtMs,
        });
        const text = shouldNotify
          ? isAssistantText
            ? `Codex: ${snippet}`
            : `Thinking: ${snippet}`
          : null;
        return [text, { ...state, content }] as const;
      });
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
