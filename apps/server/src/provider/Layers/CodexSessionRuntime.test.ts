import assert from "node:assert/strict";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { it as effectIt } from "@effect/vitest";
import { describe, it } from "vite-plus/test";
import { ThreadId, TurnId } from "@t3tools/contracts";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexRpc from "effect-codex-app-server/rpc";

import {
  CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
  makeCodexDefaultModeDeveloperInstructions,
  makeCodexPlanModeDeveloperInstructions,
} from "../CodexDeveloperInstructions.ts";
import {
  buildTurnSteerParams,
  buildTurnStartParams,
  hasConfiguredMcpServer,
  isRecoverableThreadResumeError,
  openCodexThread,
  shouldRefreshMcpToolCatalogBeforeTurn,
} from "./CodexSessionRuntime.ts";
import {
  CODEX_MCP_ELICITATION_APPROVAL_QUESTION_ID,
  toT3codeMcpElicitationResponse,
} from "../../t3code-custom/provider/mcpElicitationPolicy.ts";
const isCodexAppServerRequestError = Schema.is(CodexErrors.CodexAppServerRequestError);

function makeThreadOpenResponse(
  threadId: string,
): CodexRpc.ClientRequestResponsesByMethod["thread/start"] {
  return {
    cwd: "/tmp/project",
    model: "gpt-5.3-codex",
    modelProvider: "openai",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: { type: "danger-full-access" },
    thread: {
      id: threadId,
      createdAt: "2026-04-18T00:00:00.000Z",
      source: { session: "cli" },
      turns: [],
      status: {
        state: "idle",
        activeFlags: [],
      },
    },
  } as unknown as CodexRpc.ClientRequestResponsesByMethod["thread/start"];
}

describe("buildTurnStartParams", () => {
  it("includes plan collaboration mode when requested", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Make a plan",
        model: "gpt-5.3-codex",
        effort: "medium",
        interactionMode: "plan",
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "dangerFullAccess",
      },
      input: [
        {
          type: "text",
          text: "Make a plan",
        },
      ],
      model: "gpt-5.3-codex",
      effort: "medium",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("includes default collaboration mode and image attachments", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "auto-accept-edits",
        prompt: "Implement it",
        model: "gpt-5.3-codex",
        interactionMode: "default",
        attachments: [
          {
            type: "image",
            url: "data:image/png;base64,abc",
          },
        ],
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "on-request",
      sandboxPolicy: {
        type: "workspaceWrite",
      },
      input: [
        {
          type: "text",
          text: "Implement it",
        },
        {
          type: "image",
          url: "data:image/png;base64,abc",
        },
      ],
      model: "gpt-5.3-codex",
      collaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("omits collaboration mode when interaction mode is absent", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "approval-required",
        prompt: "Review",
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "untrusted",
      sandboxPolicy: {
        type: "readOnly",
      },
      input: [
        {
          type: "text",
          text: "Review",
        },
      ],
    });
  });

  it("adds preview MCP instructions only when enabled", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Inspect the app",
        interactionMode: "default",
        previewMcpEnabled: true,
      }),
    );

    assert.match(params.collaborationMode?.settings.developer_instructions ?? "", /preview_status/);
  });
});

describe("buildTurnSteerParams", () => {
  it("targets the active turn with user input", () => {
    const params = Effect.runSync(
      buildTurnSteerParams({
        threadId: "provider-thread-1",
        expectedTurnId: TurnId.make("turn-active"),
        prompt: "Use the simpler approach",
        attachments: [
          {
            type: "image",
            url: "data:image/png;base64,abc",
          },
        ],
        skills: [{ name: "frontend-design", path: "/tmp/skills/frontend-design" }],
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      expectedTurnId: "turn-active",
      input: [
        {
          type: "text",
          text: "Use the simpler approach",
        },
        {
          type: "image",
          url: "data:image/png;base64,abc",
        },
        {
          type: "skill",
          name: "frontend-design",
          path: "/tmp/skills/frontend-design",
        },
      ],
    });
  });
});

describe("T3 browser developer instructions", () => {
  it("omits product-native preview tools by default", () => {
    for (const instructions of [
      CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
      CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
    ]) {
      assert.doesNotMatch(instructions, /preview_status/);
      assert.doesNotMatch(instructions, /Do not switch to global browser skills/);
    }
  });

  it("prefers the product-native preview tools when preview MCP is enabled", () => {
    for (const instructions of [
      makeCodexDefaultModeDeveloperInstructions({ previewMcpEnabled: true }),
      makeCodexPlanModeDeveloperInstructions({ previewMcpEnabled: true }),
    ]) {
      assert.match(instructions, /t3-code/);
      assert.match(instructions, /preview_status/);
      assert.match(instructions, /preview_open/);
      assert.match(instructions, /Do not switch to global browser skills/);
    }
  });
});

describe("hasConfiguredMcpServer", () => {
  it("detects inline Codex MCP configuration arguments", () => {
    assert.equal(hasConfiguredMcpServer(undefined), false);
    assert.equal(hasConfiguredMcpServer(["--model", "gpt-5.4"]), false);
    assert.equal(
      hasConfiguredMcpServer(["-c", 'mcp_servers.t3-code.url="http://127.0.0.1/mcp"']),
      true,
    );
  });
});

describe("shouldRefreshMcpToolCatalogBeforeTurn", () => {
  it("refreshes only once per configured Codex MCP session", () => {
    const appServerArgs = ["-c", 'mcp_servers.t3-code.url="http://127.0.0.1/mcp"'];

    assert.equal(
      shouldRefreshMcpToolCatalogBeforeTurn({
        appServerArgs,
        hasAttemptedRefresh: false,
      }),
      true,
    );
    assert.equal(
      shouldRefreshMcpToolCatalogBeforeTurn({
        appServerArgs,
        hasAttemptedRefresh: true,
      }),
      false,
    );
    assert.equal(
      shouldRefreshMcpToolCatalogBeforeTurn({
        appServerArgs: undefined,
        hasAttemptedRefresh: false,
      }),
      false,
    );
  });
});

describe("isRecoverableThreadResumeError", () => {
  it("matches missing thread errors", () => {
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Thread does not exist",
        }),
      ),
      true,
    );
  });

  it("ignores non-recoverable resume errors", () => {
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Permission denied",
        }),
      ),
      false,
    );
  });

  it("ignores unrelated missing-resource errors that do not mention threads", () => {
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Config file not found",
        }),
      ),
      false,
    );
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Model does not exist",
        }),
      ),
      false,
    );
  });
});

describe("toT3codeMcpElicitationResponse", () => {
  it("accepts explicit approval answers", () => {
    assert.deepStrictEqual(
      toT3codeMcpElicitationResponse({
        [CODEX_MCP_ELICITATION_APPROVAL_QUESTION_ID]: "Allow",
      }),
      {
        action: "accept",
        content: {},
      },
    );
  });

  it("declines denied or missing approval answers", () => {
    assert.deepStrictEqual(
      toT3codeMcpElicitationResponse({
        [CODEX_MCP_ELICITATION_APPROVAL_QUESTION_ID]: "Deny",
      }),
      {
        action: "decline",
      },
    );
    assert.deepStrictEqual(toT3codeMcpElicitationResponse({}), {
      action: "decline",
    });
  });
});

describe("openCodexThread", () => {
  effectIt.effect("falls back to thread/start when resume fails recoverably", () =>
    Effect.gen(function* () {
      const calls: Array<{ method: "thread/start" | "thread/resume"; payload: unknown }> = [];
      const started = makeThreadOpenResponse("fresh-thread");
      const client = {
        request: <M extends "thread/start" | "thread/resume">(
          method: M,
          payload: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          calls.push({ method, payload });
          if (method === "thread/resume") {
            return Effect.fail(
              new CodexErrors.CodexAppServerRequestError({
                code: -32603,
                errorMessage: "thread not found",
              }),
            );
          }
          return Effect.succeed(started as CodexRpc.ClientRequestResponsesByMethod[M]);
        },
      };

      const opened = yield* openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      });

      assert.equal(opened.thread.id, "fresh-thread");
      assert.deepStrictEqual(
        calls.map((call) => call.method),
        ["thread/resume", "thread/start"],
      );
    }),
  );

  effectIt.effect("propagates non-recoverable resume failures", () =>
    Effect.gen(function* () {
      const client = {
        request: <M extends "thread/start" | "thread/resume">(
          method: M,
          _payload: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          if (method === "thread/resume") {
            return Effect.fail(
              new CodexErrors.CodexAppServerRequestError({
                code: -32603,
                errorMessage: "timed out waiting for server",
              }),
            );
          }
          return Effect.succeed(
            makeThreadOpenResponse("fresh-thread") as CodexRpc.ClientRequestResponsesByMethod[M],
          );
        },
      };

      const exit = yield* openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      }).pipe(Effect.exit);

      assert.equal(Exit.isFailure(exit), true);
      const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
      assert.equal(
        isCodexAppServerRequestError(error) &&
          error.errorMessage === "timed out waiting for server",
        true,
      );
    }),
  );
});
