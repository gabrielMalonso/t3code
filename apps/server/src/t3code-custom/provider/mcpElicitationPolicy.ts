import type { ProviderUserInputAnswers, UserInputQuestion } from "@t3tools/contracts";
import type * as EffectCodexSchema from "effect-codex-app-server/schema";

export const CODEX_MCP_ELICITATION_APPROVAL_QUESTION_ID = "approval";
export const CODEX_MCP_ELICITATION_ACCEPT_LABEL = "Allow";
export const CODEX_MCP_ELICITATION_DECLINE_LABEL = "Deny";

function trimText(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readSingleUserInputAnswer(
  answers: ProviderUserInputAnswers,
  questionId: string,
): string | undefined {
  const answer = answers[questionId];
  if (typeof answer === "string") {
    return answer;
  }
  if (Array.isArray(answer) && typeof answer[0] === "string") {
    return answer[0];
  }
  return undefined;
}

export function toT3codeMcpElicitationResponse(
  answers: ProviderUserInputAnswers,
): EffectCodexSchema.McpServerElicitationRequestResponse {
  const answer = readSingleUserInputAnswer(answers, CODEX_MCP_ELICITATION_APPROVAL_QUESTION_ID)
    ?.trim()
    .toLowerCase();

  if (answer === "allow" || answer === "accept" || answer === "approve" || answer === "yes") {
    return {
      action: "accept",
      content: {},
    };
  }

  if (answer === "cancel") {
    return {
      action: "cancel",
    };
  }

  return {
    action: "decline",
  };
}

export function toT3codeMcpElicitationQuestions(
  payload: EffectCodexSchema.ServerRequest__McpServerElicitationRequestParams,
): ReadonlyArray<UserInputQuestion> | undefined {
  const prompt = trimText(payload.message);
  if (!prompt) {
    return undefined;
  }

  return [
    {
      id: CODEX_MCP_ELICITATION_APPROVAL_QUESTION_ID,
      header: "Computer Use",
      question: prompt,
      options: [
        {
          label: CODEX_MCP_ELICITATION_ACCEPT_LABEL,
          description: "Allow this computer-use request.",
        },
        {
          label: CODEX_MCP_ELICITATION_DECLINE_LABEL,
          description: "Decline this computer-use request.",
        },
      ],
      multiSelect: false,
    },
  ];
}
