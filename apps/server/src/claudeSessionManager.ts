import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  ApprovalRequestId,
  EventId,
  ProviderItemId,
  type ProviderApprovalDecision,
  type ProviderSession,
  type ProviderTurnStartResult,
  type ProviderUserInputAnswers,
  type RuntimeMode,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

const APPROVAL_TIMEOUT_MS = 120_000;

/**
 * When running inside an Electron asar bundle (ELECTRON_RUN_AS_NODE=1),
 * child_process.spawn cannot access files inside `app.asar`.
 * The `asarUnpack` electron-builder config extracts files to `app.asar.unpacked/`,
 * but plain Node.js doesn't redirect automatically. This helper rewrites paths.
 */
const fixAsarPath = (s: string) => s.replaceAll(".asar/", ".asar.unpacked/");
const RUNNING_INSIDE_ASAR = (() => {
  try {
    return require.resolve("@anthropic-ai/claude-agent-sdk").includes(".asar/");
  } catch {
    return false;
  }
})();

interface MutableSession {
  provider: "claudeCode";
  status: "connecting" | "ready" | "running" | "error" | "closed";
  runtimeMode: RuntimeMode;
  cwd?: string;
  model?: string;
  threadId: ThreadId;
  activeTurnId?: TurnId;
  createdAt: string;
  updatedAt: string;
}

interface ClaudeSessionContext {
  mutableSession: MutableSession;
  queryInstance: ReturnType<typeof query> | null;
  abortController: AbortController;
  sessionId: string;
  sdkSessionId: string | null;
  pendingApprovals: Map<
    ApprovalRequestId,
    {
      resolve: (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >;
  stopping: boolean;
  activeTurnId: TurnId | null;
  stderrChunks: string[];
}

export interface ClaudeProviderEvent {
  id: EventId;
  provider: "claudeCode";
  threadId: ThreadId;
  createdAt: string;
  method: string;
  message?: string;
  turnId?: TurnId;
  itemId?: ProviderItemId;
  requestId?: ApprovalRequestId;
  sdkMessage?: SDKMessage;
  payload?: unknown;
}

export interface ClaudeSessionStartInput {
  threadId: ThreadId;
  provider: "claudeCode";
  cwd?: string;
  model?: string;
  runtimeMode: RuntimeMode;
  providerOptions?: {
    claudeCode?: {
      binaryPath?: string;
      permissionMode?: string;
    };
  };
  thinkingMode?: string;
  resumeSessionId?: string;
}

function toProviderSession(s: MutableSession): ProviderSession {
  return {
    provider: s.provider,
    status: s.status,
    runtimeMode: s.runtimeMode,
    ...(s.cwd ? { cwd: s.cwd } : {}),
    ...(s.model ? { model: s.model } : {}),
    threadId: s.threadId,
    ...(s.activeTurnId ? { activeTurnId: s.activeTurnId } : {}),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export class ClaudeSessionManager extends EventEmitter {
  private sessions = new Map<ThreadId, ClaudeSessionContext>();

  async startSession(input: ClaudeSessionStartInput): Promise<ProviderSession> {
    if (this.sessions.has(input.threadId)) {
      this.stopSession(input.threadId);
    }

    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const abortController = new AbortController();

    const mutableSession: MutableSession = {
      provider: "claudeCode",
      status: "connecting",
      runtimeMode: input.runtimeMode,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.model ? { model: input.model } : {}),
      threadId: input.threadId,
      createdAt: now,
      updatedAt: now,
    };

    const context: ClaudeSessionContext = {
      mutableSession,
      queryInstance: null,
      abortController,
      sessionId,
      sdkSessionId: null,
      pendingApprovals: new Map(),
      stopping: false,
      activeTurnId: null,
      stderrChunks: [],
    };

    this.sessions.set(input.threadId, context);

    this.emitEvent(input.threadId, "session/connecting", "Initializing Claude session");

    return toProviderSession(mutableSession);
  }

  async sendTurn(input: {
    threadId: ThreadId;
    input?: string;
    model?: string;
    interactionMode?: string;
  }): Promise<ProviderTurnStartResult> {
    const context = this.getContext(input.threadId);
    const turnId = TurnId.makeUnsafe(randomUUID());
    context.activeTurnId = turnId;
    context.mutableSession.activeTurnId = turnId;
    context.mutableSession.status = "running";
    context.mutableSession.updatedAt = new Date().toISOString();

    if (context.activeTurnId) {
      this.emitEvent(input.threadId, "turn/started", undefined, {
        turnId: context.activeTurnId,
      });
    }

    const prompt = input.input ?? "";

    // For both first and follow-up turns, spawn a new query.
    // Follow-up turns use `resume: sdkSessionId` to continue the conversation.
    this.spawnQuery(context, prompt, input.model, input.interactionMode);

    return {
      threadId: input.threadId,
      turnId,
    };
  }

  async interruptTurn(threadId: ThreadId, _turnId?: TurnId): Promise<void> {
    const context = this.getContext(threadId);
    if (context.queryInstance) {
      context.queryInstance.interrupt();
    }
    if (context.activeTurnId) {
      this.emitEvent(threadId, "turn/aborted", "Turn interrupted by user", {
        turnId: context.activeTurnId,
      });
    } else {
      this.emitEvent(threadId, "turn/aborted", "Turn interrupted by user");
    }
  }

  async respondToRequest(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    const context = this.getContext(threadId);
    const pending = context.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error(`Unknown pending permission request '${requestId}'.`);
    }

    clearTimeout(pending.timeout);
    context.pendingApprovals.delete(requestId);

    if (decision === "accept" || decision === "acceptForSession") {
      pending.resolve({ behavior: "allow" });
    } else {
      pending.resolve({ behavior: "deny", message: `User ${decision}` });
    }

    this.emitEvent(threadId, "item/requestApproval/decision", undefined, {
      payload: { requestId, decision },
    });
  }

  async respondToUserInput(
    _threadId: ThreadId,
    _requestId: ApprovalRequestId,
    _answers: ProviderUserInputAnswers,
  ): Promise<void> {
    // No-op: Claude Agent SDK doesn't have a direct user-input request mechanism.
  }

  stopSession(threadId: ThreadId): void {
    const context = this.sessions.get(threadId);
    if (!context) return;

    context.stopping = true;
    context.abortController.abort();

    if (context.queryInstance) {
      try {
        context.queryInstance.close();
      } catch {
        // Ignore close errors during shutdown.
      }
    }

    for (const [, pending] of context.pendingApprovals) {
      clearTimeout(pending.timeout);
      pending.resolve({ behavior: "deny", message: "Session stopped" });
    }
    context.pendingApprovals.clear();

    this.sessions.delete(threadId);
    this.emitEvent(threadId, "session/exited", "Session stopped");
  }

  hasSession(threadId: ThreadId): boolean {
    return this.sessions.has(threadId);
  }

  listSessions(): ProviderSession[] {
    return Array.from(this.sessions.values()).map((ctx) => toProviderSession(ctx.mutableSession));
  }

  stopAll(): void {
    for (const threadId of this.sessions.keys()) {
      this.stopSession(threadId);
    }
  }

  private getContext(threadId: ThreadId): ClaudeSessionContext {
    const context = this.sessions.get(threadId);
    if (!context) {
      throw new Error(`Unknown provider session '${threadId}'.`);
    }
    return context;
  }

  private spawnQuery(
    context: ClaudeSessionContext,
    prompt: string,
    model?: string,
    interactionMode?: string,
  ): void {
    // Close previous query if any (for follow-up turns)
    if (context.queryInstance) {
      try {
        context.queryInstance.close();
      } catch {
        // Ignore close errors
      }
    }

    // Deny any pending approvals from the previous turn so they don't leak.
    for (const [, pending] of context.pendingApprovals) {
      clearTimeout(pending.timeout);
      pending.resolve({ behavior: "deny", message: "Turn interrupted" });
    }
    context.pendingApprovals.clear();

    const threadId = context.mutableSession.threadId;
    const cwd = context.mutableSession.cwd;
    const effectivePermission =
      interactionMode === "plan"
        ? "plan"
        : context.mutableSession.runtimeMode === "full-access"
          ? "bypassPermissions"
          : "default";

    context.stderrChunks = [];

    const q = query({
      prompt,
      options: {
        ...(cwd ? { cwd } : {}),
        model: model ?? context.mutableSession.model ?? "claude-sonnet-4-6",
        includePartialMessages: true,
        thinking: { type: "adaptive" },
        abortController: context.abortController,
        permissionMode: effectivePermission as "default" | "bypassPermissions" | "plan",
        maxTurns: 200,
        ...(context.sdkSessionId ? { resume: context.sdkSessionId } : {}),
        stderr: (chunk: string) => {
          context.stderrChunks.push(chunk);
        },
        ...(RUNNING_INSIDE_ASAR
          ? {
              spawnClaudeCodeProcess: (config: {
                command: string;
                args: string[];
                cwd: string;
                env: Record<string, string>;
                signal: AbortSignal;
              }) => {
                const child = spawn(fixAsarPath(config.command), config.args.map(fixAsarPath), {
                  cwd: config.cwd,
                  stdio: ["pipe", "pipe", "pipe"],
                  signal: config.signal,
                  env: config.env,
                  windowsHide: true,
                });
                child.stderr?.on("data", (chunk: Buffer) => {
                  context.stderrChunks.push(chunk.toString());
                });
                return {
                  stdin: child.stdin,
                  stdout: child.stdout,
                  get killed() {
                    return child.killed;
                  },
                  get exitCode() {
                    return child.exitCode;
                  },
                  kill: child.kill.bind(child),
                  on: child.on.bind(child),
                  once: child.once.bind(child),
                  off: child.off.bind(child),
                };
              },
            }
          : {}),
        canUseTool: async (
          toolName: string,
          toolInput: Record<string, unknown>,
          _toolContext: { toolUseID: string; signal: AbortSignal },
        ) => {
          if (context.mutableSession.runtimeMode === "full-access") {
            return { behavior: "allow" as const };
          }

          const requestId = ApprovalRequestId.makeUnsafe(randomUUID());

          if (context.activeTurnId) {
            this.emitEvent(threadId, "request/opened", undefined, {
              turnId: context.activeTurnId,
              requestId,
              payload: {
                requestType: toolNameToRequestType(toolName),
                detail:
                  toolName === "Bash"
                    ? ((toolInput.command as string | undefined) ?? toolName)
                    : toolName,
                args: toolInput,
              },
            });
          } else {
            this.emitEvent(threadId, "request/opened", undefined, {
              requestId,
              payload: {
                requestType: toolNameToRequestType(toolName),
                detail:
                  toolName === "Bash"
                    ? ((toolInput.command as string | undefined) ?? toolName)
                    : toolName,
                args: toolInput,
              },
            });
          }

          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              context.pendingApprovals.delete(requestId);
              resolve({ behavior: "deny", message: "Approval timed out" });
            }, APPROVAL_TIMEOUT_MS);

            context.pendingApprovals.set(requestId, { resolve, timeout });
          });
        },
      },
    });

    context.queryInstance = q;

    // Consume the async generator in the background
    this.consumeMessages(context, q).catch((error) => {
      if (!context.stopping) {
        const stderr = context.stderrChunks.join("").trim();
        const errorMsg = stderr ? `${String(error)}\n--- stderr ---\n${stderr}` : String(error);
        this.emitEvent(threadId, "runtime.error", errorMsg, {
          payload: { message: errorMsg, class: "provider_error" },
        });
      }
    });
  }

  private async consumeMessages(
    context: ClaudeSessionContext,
    q: AsyncGenerator<SDKMessage, void>,
  ): Promise<void> {
    const threadId = context.mutableSession.threadId;

    try {
      for await (const message of q) {
        if (context.stopping) break;
        this.emitSdkMessage(threadId, context, message);
      }
    } catch (error) {
      if (!context.stopping) {
        const stderr = context.stderrChunks.join("").trim();
        const errorMsg = stderr ? `${String(error)}\n--- stderr ---\n${stderr}` : String(error);
        this.emitEvent(threadId, "runtime.error", errorMsg, {
          payload: { message: errorMsg, class: "provider_error" },
        });
      }
    } finally {
      if (!context.stopping) {
        context.mutableSession.status = "ready";
        context.mutableSession.updatedAt = new Date().toISOString();
        context.activeTurnId = null;
      }
    }
  }

  private emitSdkMessage(
    threadId: ThreadId,
    context: ClaudeSessionContext,
    message: SDKMessage,
  ): void {
    // Capture the SDK session ID from the system message for multi-turn resume
    if (message.type === "system" && !context.sdkSessionId) {
      const systemMsg = message as Record<string, unknown>;
      if (typeof systemMsg.session_id === "string") {
        context.sdkSessionId = systemMsg.session_id;
      }
    }

    const event: ClaudeProviderEvent = {
      id: EventId.makeUnsafe(randomUUID()),
      provider: "claudeCode",
      threadId,
      createdAt: new Date().toISOString(),
      method: `claude/${message.type}`,
      sdkMessage: message,
    };
    if (context.activeTurnId) {
      event.turnId = context.activeTurnId;
    }
    this.emit("sdkMessage", event);
  }

  private emitEvent(
    threadId: ThreadId,
    method: string,
    message?: string,
    extra?: {
      turnId?: TurnId;
      itemId?: ProviderItemId;
      requestId?: ApprovalRequestId;
      payload?: unknown;
    },
  ): void {
    const event: ClaudeProviderEvent = {
      id: EventId.makeUnsafe(randomUUID()),
      provider: "claudeCode",
      threadId,
      createdAt: new Date().toISOString(),
      method,
    };
    if (message) event.message = message;
    if (extra?.turnId) event.turnId = extra.turnId;
    if (extra?.itemId) event.itemId = extra.itemId;
    if (extra?.requestId) event.requestId = extra.requestId;
    if (extra?.payload !== undefined) event.payload = extra.payload;
    this.emit("sdkMessage", event);
  }
}

function toolNameToRequestType(
  toolName: string,
): "command_execution_approval" | "file_change_approval" | "file_read_approval" | "unknown" {
  switch (toolName) {
    case "Bash":
      return "command_execution_approval";
    case "Edit":
    case "Write":
      return "file_change_approval";
    case "Read":
    case "Glob":
    case "Grep":
      return "file_read_approval";
    default:
      return "unknown";
  }
}
