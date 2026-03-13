import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { ThreadId } from "@t3tools/contracts";
import { Effect, ManagedRuntime, Stream } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../Services/ClaudeCodeAdapter.ts";
import { makeClaudeCodeAdapterLive } from "./ClaudeCodeAdapter.ts";

const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);

class FakeClaudeQuery implements AsyncIterable<SDKMessage> {
  private queue: SDKMessage[] = [];
  private resolvers: Array<(result: IteratorResult<SDKMessage>) => void> = [];
  private closed = false;

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    return {
      next: () => {
        const message = this.queue.shift();
        if (message) {
          return Promise.resolve({ done: false, value: message });
        }
        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }

  push(message: SDKMessage): void {
    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ done: false, value: message });
      return;
    }
    this.queue.push(message);
  }

  close = (): void => {
    this.closed = true;
    for (const resolve of this.resolvers.splice(0)) {
      resolve({ done: true, value: undefined });
    }
  };

  interrupt = async (): Promise<void> => undefined;
  setModel = async (_model?: string): Promise<void> => undefined;
  setPermissionMode = async (_mode: string): Promise<void> => undefined;
  setMaxThinkingTokens = async (_maxThinkingTokens: number | null): Promise<void> => undefined;
}

function makeStreamEvent(
  sessionId: string,
  event: Record<string, unknown>,
  uuid: string,
): SDKMessage {
  return {
    type: "stream_event",
    event,
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid,
  } as SDKMessage;
}

describe("ClaudeCodeAdapter", () => {
  let runtime: ManagedRuntime.ManagedRuntime<ClaudeCodeAdapter, never> | null = null;
  let fakeQuery: FakeClaudeQuery | null = null;

  afterEach(async () => {
    fakeQuery?.close();
    fakeQuery = null;
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
  });

  it("accumulates input_json_delta and includes final tool input on item.completed", async () => {
    fakeQuery = new FakeClaudeQuery();
    runtime = ManagedRuntime.make(
      makeClaudeCodeAdapterLive({
        createQuery: (_input: { readonly prompt: AsyncIterable<SDKUserMessage> }) =>
          fakeQuery as FakeClaudeQuery,
      }),
    );

    const adapter = await runtime.runPromise(Effect.service(ClaudeCodeAdapter));
    const eventsPromise = runtime.runPromise(
      Stream.runCollect(Stream.take(adapter.streamEvents, 7)),
    );

    await runtime.runPromise(
      adapter.startSession({
        provider: "claudeCode",
        threadId: asThreadId("thread-1"),
        runtimeMode: "approval-required",
      }),
    );
    await runtime.runPromise(
      adapter.sendTurn({
        threadId: asThreadId("thread-1"),
        input: "Read the file",
        attachments: [],
      }),
    );

    fakeQuery.push(
      makeStreamEvent(
        "claude-session-1",
        {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "tool-read-1",
            name: "Read",
            input: {},
          },
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    fakeQuery.push(
      makeStreamEvent(
        "claude-session-1",
        {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: '{"file_path":"/tmp/src/App.tsx"',
          },
        },
        "22222222-2222-4222-8222-222222222222",
      ),
    );
    fakeQuery.push(
      makeStreamEvent(
        "claude-session-1",
        {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: ',"offset":10}',
          },
        },
        "33333333-3333-4333-8333-333333333333",
      ),
    );
    fakeQuery.push(
      makeStreamEvent(
        "claude-session-1",
        {
          type: "content_block_stop",
          index: 0,
        },
        "44444444-4444-4444-8444-444444444444",
      ),
    );

    const events = Array.from(await eventsPromise);
    const toolStarted = events.find(
      (event) => event.type === "item.started" && event.itemId === "tool-read-1",
    );
    const toolCompleted = events.find(
      (event) => event.type === "item.completed" && event.itemId === "tool-read-1",
    );

    expect(toolStarted?.type).toBe("item.started");
    if (toolStarted?.type === "item.started") {
      expect(toolStarted.payload.detail).toBeUndefined();
      expect(toolStarted.payload.data).toEqual({
        toolName: "Read",
        input: {},
      });
    }

    expect(toolCompleted?.type).toBe("item.completed");
    if (toolCompleted?.type === "item.completed") {
      expect(toolCompleted.payload.detail).toBe(
        'Read: {"file_path":"/tmp/src/App.tsx","offset":10}',
      );
      expect(toolCompleted.payload.data).toEqual({
        toolName: "Read",
        input: {
          file_path: "/tmp/src/App.tsx",
          offset: 10,
        },
      });
    }
  });
});
