/**
 * ClaudeCodeAdapterLive - Scoped live implementation for the Claude Code provider adapter.
 *
 * Wraps `ClaudeSessionManager` behind the `ClaudeCodeAdapter` service contract and
 * maps manager failures into the shared `ProviderAdapterError` algebra.
 *
 * @module ClaudeCodeAdapterLive
 */
import {
  type CanonicalItemType,
  type CanonicalRequestType,
  type ProviderRuntimeEvent,
  type ProviderUserInputAnswers,
  RuntimeItemId,
  RuntimeRequestId,
  ProviderApprovalDecision,
  ProviderItemId,
  ThreadId,
  TurnId,
  EventId,
} from "@t3tools/contracts";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Layer, Queue, Stream } from "effect";

import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import {
  ClaudeCodeAdapter,
  type ClaudeCodeAdapterShape,
} from "../Services/ClaudeCodeAdapter.ts";
import {
  ClaudeSessionManager,
  type ClaudeProviderEvent,
} from "../../claudeSessionManager.ts";
import type { EventNdjsonLogger } from "./EventNdjsonLogger.ts";
import { randomUUID } from "node:crypto";

const PROVIDER = "claudeCode" as const;

export interface ClaudeCodeAdapterLiveOptions {
  readonly manager?: ClaudeSessionManager;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

function toRequestError(threadId: ThreadId, method: string, cause: unknown): ProviderAdapterError {
  const normalized = toMessage(cause, "").toLowerCase();
  if (normalized.includes("unknown") && normalized.includes("session")) {
    return new ProviderAdapterSessionNotFoundError({
      provider: PROVIDER,
      threadId,
      cause,
    });
  }
  return new ProviderAdapterRequestError({
    provider: PROVIDER,
    method,
    detail: toMessage(cause, `${method} failed`),
    cause,
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function truncateStr(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function basenameFromPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
}

function toolDetailSummary(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string | undefined {
  if (!input) return undefined;
  switch (toolName) {
    case "Bash": {
      const cmd = asString(input.command);
      return cmd ? truncateStr(cmd, 120) : asString(input.description);
    }
    case "Read": {
      const fp = asString(input.file_path);
      return fp ? basenameFromPath(fp) : undefined;
    }
    case "Write": {
      const fp = asString(input.file_path);
      const content = asString(input.content);
      const lineCount = content ? content.split("\n").length : undefined;
      return fp
        ? `${basenameFromPath(fp)}${lineCount ? ` (${lineCount} lines)` : ""}`
        : undefined;
    }
    case "Edit": {
      const fp = asString(input.file_path);
      return fp ? basenameFromPath(fp) : undefined;
    }
    case "Glob": {
      return asString(input.pattern);
    }
    case "Grep": {
      return asString(input.pattern);
    }
    case "Agent": {
      const desc = asString(input.description);
      return desc ? truncateStr(desc, 100) : undefined;
    }
    case "WebSearch": {
      return asString(input.query);
    }
    default:
      return undefined;
  }
}

// ─── Event Mapping ───────────────────────────────────────────────────────────

function makeEventBase(
  event: ClaudeProviderEvent,
): Omit<ProviderRuntimeEvent, "type" | "payload"> {
  return {
    eventId: event.id,
    provider: PROVIDER,
    threadId: event.threadId,
    createdAt: event.createdAt,
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.itemId ? { itemId: RuntimeItemId.makeUnsafe(event.itemId) } : {}),
    ...(event.requestId
      ? { requestId: RuntimeRequestId.makeUnsafe(event.requestId) }
      : {}),
    raw: {
      source: "claude.agent-sdk.message" as const,
      messageType: event.method,
      payload: event.sdkMessage ?? event.payload ?? {},
    },
  };
}

function sdkToolNameToItemType(toolName: string): CanonicalItemType {
  switch (toolName) {
    case "Bash":
      return "command_execution";
    case "Edit":
    case "Write":
      return "file_change";
    case "Read":
    case "Glob":
    case "Grep":
      return "file_change";
    case "Agent":
      return "collab_agent_tool_call";
    case "WebSearch":
      return "web_search";
    default:
      return "unknown";
  }
}

function mapClaudeToRuntimeEvents(
  event: ClaudeProviderEvent,
): ReadonlyArray<ProviderRuntimeEvent> {
  const base = makeEventBase(event);
  const sdkMessage = event.sdkMessage;

  // Non-SDK events (session lifecycle)
  if (!sdkMessage) {
    return mapLifecycleEvent(event, base);
  }

  switch (sdkMessage.type) {
    case "system":
      return mapSystemMessage(sdkMessage, base, event);

    case "stream_event":
      return mapStreamEvent(sdkMessage, base, event);

    case "assistant":
      return mapAssistantMessage(sdkMessage, base, event);

    case "user":
      return mapUserMessage(sdkMessage, base, event);

    case "result":
      return mapResultMessage(sdkMessage, base, event);

    case "tool_progress":
      return [
        {
          ...base,
          type: "tool.progress",
          payload: {
            toolName: asString((sdkMessage as Record<string, unknown>).tool_name),
            summary: asString((sdkMessage as Record<string, unknown>).summary),
          },
        },
      ];

    case "tool_use_summary":
      return [
        {
          ...base,
          type: "tool.summary",
          payload: {
            summary:
              asString((sdkMessage as Record<string, unknown>).summary) ?? "Tool completed",
          },
        },
      ];

    default:
      return [];
  }
}

function mapLifecycleEvent(
  event: ClaudeProviderEvent,
  base: Omit<ProviderRuntimeEvent, "type" | "payload">,
): ReadonlyArray<ProviderRuntimeEvent> {
  switch (event.method) {
    case "session/connecting":
      return [
        {
          ...base,
          type: "session.state.changed",
          payload: {
            state: "starting",
            ...(event.message ? { reason: event.message } : {}),
          },
        },
      ];
    case "session/exited":
      return [
        {
          ...base,
          type: "session.exited",
          payload: {
            ...(event.message ? { reason: event.message } : {}),
            exitKind: "graceful",
          },
        },
      ];
    case "turn/started":
      return [
        {
          ...base,
          type: "turn.started",
          payload: {},
        },
      ];
    case "turn/aborted":
      return [
        {
          ...base,
          type: "turn.aborted",
          payload: { reason: event.message ?? "Turn aborted" },
        },
      ];
    case "request/opened": {
      const p = asObject(event.payload);
      return [
        {
          ...base,
          type: "request.opened",
          payload: {
            requestType: (asString(p?.requestType) as CanonicalRequestType) ?? "unknown",
            ...(asString(p?.detail) ? { detail: asString(p?.detail) } : {}),
            ...(p?.args !== undefined ? { args: p.args } : {}),
          },
        },
      ];
    }
    case "item/requestApproval/decision": {
      const p = asObject(event.payload);
      return [
        {
          ...base,
          type: "request.resolved",
          payload: {
            requestType: "unknown" as CanonicalRequestType,
            ...(asString(p?.decision) ? { decision: asString(p?.decision) } : {}),
            ...(event.payload !== undefined ? { resolution: event.payload } : {}),
          },
        },
      ];
    }
    case "runtime.error": {
      const p = asObject(event.payload);
      return [
        {
          ...base,
          type: "runtime.error",
          payload: {
            message: asString(p?.message) ?? event.message ?? "Runtime error",
            class: "provider_error",
          },
        },
      ];
    }
    default:
      return [];
  }
}

function mapSystemMessage(
  msg: SDKMessage & { type: "system" },
  base: Omit<ProviderRuntimeEvent, "type" | "payload">,
  event: ClaudeProviderEvent,
): ReadonlyArray<ProviderRuntimeEvent> {
  const system = msg as Record<string, unknown>;
  return [
    {
      ...base,
      type: "session.started",
      payload: {
        message: `Claude session ${asString(system.session_id) ?? "started"}`,
      },
    },
    {
      ...base,
      eventId: EventId.makeUnsafe(randomUUID()),
      type: "session.configured",
      payload: {
        config: {
          model: asString(system.model),
          tools: system.tools,
          permissionMode: asString(system.permissionMode),
          sessionId: asString(system.session_id),
        },
      },
    },
    {
      ...base,
      eventId: EventId.makeUnsafe(randomUUID()),
      type: "session.state.changed",
      payload: { state: "ready" },
    },
  ];
}

function mapStreamEvent(
  msg: SDKMessage & { type: "stream_event" },
  base: Omit<ProviderRuntimeEvent, "type" | "payload">,
  event: ClaudeProviderEvent,
): ReadonlyArray<ProviderRuntimeEvent> {
  const streamMsg = msg as Record<string, unknown>;
  const rawEvent = streamMsg.event as Record<string, unknown> | undefined;
  if (!rawEvent) return [];

  const eventType = asString(rawEvent.type);

  switch (eventType) {
    case "content_block_start": {
      const contentBlock = asObject(rawEvent.content_block);
      const blockType = asString(contentBlock?.type);
      if (blockType === "tool_use") {
        const toolName = asString(contentBlock?.name) ?? "unknown";
        const toolId = asString(contentBlock?.id);
        return [
          {
            ...base,
            ...(toolId
              ? { itemId: RuntimeItemId.makeUnsafe(toolId) }
              : {}),
            type: "item.started",
            payload: {
              itemType: sdkToolNameToItemType(toolName),
              status: "inProgress",
              title: toolName,
              data: contentBlock,
            },
          },
        ];
      }
      if (blockType === "thinking") {
        return [
          {
            ...base,
            type: "item.started",
            payload: {
              itemType: "reasoning",
              status: "inProgress",
              title: "Thinking",
            },
          },
        ];
      }
      return [];
    }

    case "content_block_delta": {
      const delta = asObject(rawEvent.delta);
      const deltaType = asString(delta?.type);

      if (deltaType === "thinking_delta") {
        return [
          {
            ...base,
            type: "content.delta",
            payload: {
              streamKind: "reasoning_text",
              delta: asString(delta?.thinking) ?? "",
              contentIndex: typeof rawEvent.index === "number" ? rawEvent.index : undefined,
            },
          },
        ];
      }

      if (deltaType === "text_delta") {
        return [
          {
            ...base,
            type: "content.delta",
            payload: {
              streamKind: "assistant_text",
              delta: asString(delta?.text) ?? "",
              contentIndex: typeof rawEvent.index === "number" ? rawEvent.index : undefined,
            },
          },
        ];
      }

      if (deltaType === "input_json_delta") {
        // Tool input streaming — accumulate silently
        return [];
      }

      if (deltaType === "signature_delta") {
        // Thinking signature — skip
        return [];
      }

      return [];
    }

    case "content_block_stop": {
      return [
        {
          ...base,
          type: "item.completed",
          payload: {
            itemType: "unknown",
            status: "completed",
          },
        },
      ];
    }

    case "message_start": {
      return [
        {
          ...base,
          type: "session.state.changed",
          payload: { state: "running" },
        },
      ];
    }

    case "message_delta": {
      const msgDelta = asObject(rawEvent.delta);
      const usage = asObject(rawEvent.usage);
      return [
        {
          ...base,
          type: "thread.token-usage.updated",
          payload: { usage: usage ?? {} },
        },
      ];
    }

    case "message_stop":
      return [];

    default:
      return [];
  }
}

function mapAssistantMessage(
  msg: SDKMessage & { type: "assistant" },
  base: Omit<ProviderRuntimeEvent, "type" | "payload">,
  event: ClaudeProviderEvent,
): ReadonlyArray<ProviderRuntimeEvent> {
  // Full assistant message — content blocks already streamed via stream_event.
  // Emit item.completed for each tool_use block for proper activity tracking.
  const assistantMsg = msg as Record<string, unknown>;
  const message = asObject(assistantMsg.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];

  const events: ProviderRuntimeEvent[] = [];

  for (const block of content) {
    const blockObj = asObject(block);
    if (!blockObj) continue;
    const blockType = asString(blockObj.type);

    if (blockType === "tool_use") {
      const toolName = asString(blockObj.name) ?? "unknown";
      const toolId = asString(blockObj.id);
      const inputObj = asObject(blockObj.input);
      const detail = toolDetailSummary(toolName, inputObj);
      events.push({
        ...base,
        eventId: EventId.makeUnsafe(randomUUID()),
        ...(toolId ? { itemId: RuntimeItemId.makeUnsafe(toolId) } : {}),
        type: "item.completed",
        payload: {
          itemType: sdkToolNameToItemType(toolName),
          status: "completed",
          title: toolName,
          ...(detail ? { detail } : {}),
          data: blockObj,
        },
      });
    }
  }

  return events;
}

function mapUserMessage(
  msg: SDKMessage & { type: "user" },
  base: Omit<ProviderRuntimeEvent, "type" | "payload">,
  _event: ClaudeProviderEvent,
): ReadonlyArray<ProviderRuntimeEvent> {
  // Tool result messages
  const userMsg = msg as Record<string, unknown>;
  if (!userMsg.tool_use_result) return [];

  return [];
}

function mapResultMessage(
  msg: SDKMessage & { type: "result" },
  base: Omit<ProviderRuntimeEvent, "type" | "payload">,
  _event: ClaudeProviderEvent,
): ReadonlyArray<ProviderRuntimeEvent> {
  const resultMsg = msg as Record<string, unknown>;
  const subtype = asString(resultMsg.subtype);

  if (subtype === "success") {
    return [
      {
        ...base,
        type: "turn.completed",
        payload: {
          state: "completed",
          stopReason: asString(resultMsg.stop_reason),
          ...(resultMsg.usage !== undefined ? { usage: resultMsg.usage } : {}),
          ...(asObject(resultMsg.modelUsage)
            ? { modelUsage: asObject(resultMsg.modelUsage) }
            : {}),
          ...(typeof resultMsg.total_cost_usd === "number"
            ? { totalCostUsd: resultMsg.total_cost_usd }
            : {}),
        },
      },
    ];
  }

  // Error results
  const errorMessage =
    asString(resultMsg.result) ??
    (Array.isArray(resultMsg.errors) ? resultMsg.errors.join("; ") : undefined) ??
    `Turn failed: ${subtype}`;
  return [
    {
      ...base,
      type: "turn.completed",
      payload: {
        state: "failed",
        errorMessage,
        ...(resultMsg.usage !== undefined ? { usage: resultMsg.usage } : {}),
        ...(typeof resultMsg.total_cost_usd === "number"
          ? { totalCostUsd: resultMsg.total_cost_usd }
          : {}),
      },
    },
  ];
}

// ─── Adapter Factory ─────────────────────────────────────────────────────────

const makeClaudeCodeAdapter = (options?: ClaudeCodeAdapterLiveOptions) =>
  Effect.gen(function* () {
    const manager = yield* Effect.acquireRelease(
      Effect.sync(() => options?.manager ?? new ClaudeSessionManager()),
      (manager) =>
        Effect.sync(() => {
          try {
            manager.stopAll();
          } catch {
            // Finalizers should never fail and block shutdown.
          }
        }),
    );

    const startSession: ClaudeCodeAdapterShape["startSession"] = (input) => {
      if (input.provider !== undefined && input.provider !== PROVIDER) {
        return Effect.fail(
          new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
          }),
        );
      }

      const claudeOpts = input.providerOptions?.claudeCode;
      return Effect.tryPromise({
        try: () =>
          manager.startSession({
            threadId: input.threadId,
            provider: "claudeCode",
            ...(input.cwd ? { cwd: input.cwd } : {}),
            runtimeMode: input.runtimeMode,
            ...(input.model ? { model: input.model } : {}),
            ...(claudeOpts
              ? {
                  providerOptions: {
                    claudeCode: {
                      ...(claudeOpts.binaryPath ? { binaryPath: claudeOpts.binaryPath } : {}),
                      ...(claudeOpts.permissionMode
                        ? { permissionMode: claudeOpts.permissionMode }
                        : {}),
                    },
                  },
                }
              : {}),
            ...(input.modelOptions?.claudeCode?.thinking
              ? { thinkingMode: input.modelOptions.claudeCode.thinking }
              : {}),
          }),
        catch: (cause) =>
          new ProviderAdapterProcessError({
            provider: PROVIDER,
            threadId: input.threadId,
            detail: toMessage(cause, "Failed to start Claude adapter session."),
            cause,
          }),
      });
    };

    const sendTurn: ClaudeCodeAdapterShape["sendTurn"] = (input) =>
      Effect.tryPromise({
        try: () =>
          manager.sendTurn({
            threadId: input.threadId,
            ...(input.input ? { input: input.input } : {}),
            ...(input.model ? { model: input.model } : {}),
            ...(input.interactionMode ? { interactionMode: input.interactionMode } : {}),
          }),
        catch: (cause) => toRequestError(input.threadId, "turn/start", cause),
      }).pipe(
        Effect.map((result) => ({
          ...result,
          threadId: input.threadId,
        })),
      );

    const interruptTurn: ClaudeCodeAdapterShape["interruptTurn"] = (threadId, turnId) =>
      Effect.tryPromise({
        try: () => manager.interruptTurn(threadId, turnId),
        catch: (cause) => toRequestError(threadId, "turn/interrupt", cause),
      });

    const respondToRequest: ClaudeCodeAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      Effect.tryPromise({
        try: () => manager.respondToRequest(threadId, requestId, decision),
        catch: (cause) => toRequestError(threadId, "item/requestApproval/decision", cause),
      });

    const respondToUserInput: ClaudeCodeAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      answers,
    ) =>
      Effect.tryPromise({
        try: () => manager.respondToUserInput(threadId, requestId, answers),
        catch: (cause) => toRequestError(threadId, "item/tool/requestUserInput", cause),
      });

    const stopSession: ClaudeCodeAdapterShape["stopSession"] = (threadId) =>
      Effect.sync(() => {
        manager.stopSession(threadId);
      });

    const listSessions: ClaudeCodeAdapterShape["listSessions"] = () =>
      Effect.sync(() => manager.listSessions());

    const hasSession: ClaudeCodeAdapterShape["hasSession"] = (threadId) =>
      Effect.sync(() => manager.hasSession(threadId));

    const readThread: ClaudeCodeAdapterShape["readThread"] = (threadId) =>
      Effect.succeed({
        threadId,
        turns: [],
      });

    const rollbackThread: ClaudeCodeAdapterShape["rollbackThread"] = (threadId, numTurns) => {
      if (!Number.isInteger(numTurns) || numTurns < 1) {
        return Effect.fail(
          new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "numTurns must be an integer >= 1.",
          }),
        );
      }

      // Claude SDK doesn't support direct thread rollback; return empty snapshot
      return Effect.succeed({
        threadId,
        turns: [],
      });
    };

    const stopAll: ClaudeCodeAdapterShape["stopAll"] = () =>
      Effect.sync(() => {
        manager.stopAll();
      });

    const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const listener = (event: ClaudeProviderEvent) => {
          const runtimeEvents = mapClaudeToRuntimeEvents(event);
          if (runtimeEvents.length === 0) return;
          // Fire-and-forget queue offer
          Effect.runSync(Queue.offerAll(runtimeEventQueue, runtimeEvents));
        };
        manager.on("sdkMessage", listener);
        return listener;
      }),
      (listener) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            manager.off("sdkMessage", listener);
          });
          yield* Queue.shutdown(runtimeEventQueue);
        }),
    );

    return {
      provider: PROVIDER,
      capabilities: {
        sessionModelSwitch: "in-session",
      },
      startSession,
      sendTurn,
      interruptTurn,
      readThread,
      rollbackThread,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      stopAll,
      streamEvents: Stream.fromQueue(runtimeEventQueue),
    } satisfies ClaudeCodeAdapterShape;
  });

export const ClaudeCodeAdapterLive = Layer.effect(ClaudeCodeAdapter, makeClaudeCodeAdapter());

export function makeClaudeCodeAdapterLive(options?: ClaudeCodeAdapterLiveOptions) {
  return Layer.effect(ClaudeCodeAdapter, makeClaudeCodeAdapter(options));
}
