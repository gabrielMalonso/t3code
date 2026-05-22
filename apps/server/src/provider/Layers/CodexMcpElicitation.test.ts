import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  MCP_ELICITATION_ACTION_QUESTION_ID,
  mcpElicitationQuestions,
  mcpElicitationResponseFromAnswers,
} from "./CodexMcpElicitation.ts";

describe("Codex MCP elicitation mapping", () => {
  it("turns empty Computer Use permission forms into an explicit action question", () => {
    const params = {
      mode: "form",
      serverName: "computer-use",
      message: "Allow Codex to use T3 Code (Alpha)?",
      requestedSchema: {
        type: "object",
        properties: {},
      },
      threadId: "provider-thread-1",
      turnId: "turn-1",
    } as const;

    const questions = mcpElicitationQuestions(params);

    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.id, MCP_ELICITATION_ACTION_QUESTION_ID);
    assert.deepEqual(
      questions[0]?.options.map((option) => option.label),
      ["Allow", "Decline", "Cancel"],
    );

    assert.deepEqual(
      mcpElicitationResponseFromAnswers(params, {
        [MCP_ELICITATION_ACTION_QUESTION_ID]: "Allow",
      }),
      {
        _tag: "Ok",
        response: {
          action: "accept",
          content: {},
        },
      },
    );
  });

  it("coerces typed form answers for accepted elicitations", () => {
    const params = {
      mode: "form",
      serverName: "demo",
      message: "Configure demo",
      requestedSchema: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            title: "Enabled",
          },
          retries: {
            type: "integer",
            title: "Retries",
          },
          mode: {
            type: "string",
            title: "Mode",
            oneOf: [
              {
                const: "fast",
                title: "Fast",
              },
            ],
          },
        },
      },
      threadId: "provider-thread-1",
      turnId: "turn-1",
    } as const;

    const questions = mcpElicitationQuestions(params);
    assert.equal(questions.length, 3);
    assert.equal(questions[0]?.options[0]?.label, "true");
    assert.equal(questions[2]?.options[0]?.label, "fast");

    assert.deepEqual(
      mcpElicitationResponseFromAnswers(params, {
        enabled: "true",
        retries: "2",
        mode: "fast",
      }),
      {
        _tag: "Ok",
        response: {
          action: "accept",
          content: {
            enabled: true,
            retries: 2,
            mode: "fast",
          },
        },
      },
    );
  });
});
