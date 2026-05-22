import type {
  ProviderUserInputAnswers,
  UserInputQuestion,
  UserInputQuestionOption,
} from "@t3tools/contracts";
import type * as EffectCodexSchema from "effect-codex-app-server/schema";

export const MCP_ELICITATION_ACTION_QUESTION_ID = "__mcp_elicitation_action";

const ACCEPT_LABEL = "Allow";
const DECLINE_LABEL = "Decline";
const CANCEL_LABEL = "Cancel";

type McpElicitationParams =
  | EffectCodexSchema.McpServerElicitationRequestParams
  | EffectCodexSchema.ServerRequest__McpServerElicitationRequestParams;
type McpElicitationFormParams = Extract<McpElicitationParams, { readonly mode: "form" }>;
type McpElicitationSchema = McpElicitationFormParams["requestedSchema"];
type McpElicitationPrimitiveSchema = McpElicitationSchema["properties"][string];
type McpElicitationResponse = EffectCodexSchema.McpServerElicitationRequestResponse;
type McpElicitationAction = McpElicitationResponse["action"];

export type McpElicitationResponseResult =
  | {
      readonly _tag: "Ok";
      readonly response: McpElicitationResponse;
    }
  | {
      readonly _tag: "InvalidAnswer";
      readonly questionId: string;
    };

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function titleForProperty(name: string, schema: McpElicitationPrimitiveSchema): string {
  return trimText(toRecord(schema).title) ?? name;
}

function descriptionForProperty(
  name: string,
  schema: McpElicitationPrimitiveSchema,
): string | undefined {
  const record = toRecord(schema);
  const description = trimText(record.description);
  const title = titleForProperty(name, schema);
  return description && description !== title ? description : undefined;
}

function optionFromConst(option: unknown): UserInputQuestionOption | undefined {
  const record = toRecord(option);
  const constValue = record.const;
  if (typeof constValue !== "string" && typeof constValue !== "number") {
    return undefined;
  }
  const label = String(constValue);
  return {
    label,
    description: trimText(record.title) ?? trimText(record.description) ?? label,
  };
}

function optionsFromEnum(values: unknown, names?: unknown): ReadonlyArray<UserInputQuestionOption> {
  if (!Array.isArray(values)) return [];
  const enumNames = Array.isArray(names) ? names : [];
  return values
    .map((value, index): UserInputQuestionOption | undefined => {
      if (typeof value !== "string") return undefined;
      return {
        label: value,
        description: trimText(enumNames[index]) ?? value,
      };
    })
    .filter((option) => option !== undefined);
}

function optionsForSchema(
  schema: McpElicitationPrimitiveSchema,
): ReadonlyArray<UserInputQuestionOption> {
  const record = toRecord(schema);
  if (Array.isArray(record.oneOf)) {
    return record.oneOf.map(optionFromConst).filter((option) => option !== undefined);
  }
  if (Array.isArray(record.enum)) {
    return optionsFromEnum(record.enum, record.enumNames);
  }
  if (record.type === "array") {
    const items = toRecord(record.items);
    if (Array.isArray(items.anyOf)) {
      return items.anyOf.map(optionFromConst).filter((option) => option !== undefined);
    }
    if (Array.isArray(items.enum)) {
      return optionsFromEnum(items.enum);
    }
  }
  if (record.type === "boolean") {
    return [
      { label: "true", description: "True" },
      { label: "false", description: "False" },
    ];
  }
  return [];
}

function isMultiSelectSchema(schema: McpElicitationPrimitiveSchema): boolean {
  return toRecord(schema).type === "array";
}

function actionQuestion(params: McpElicitationParams): UserInputQuestion {
  const question = params.mode === "url" ? `${params.message}\n${params.url}` : params.message;
  return {
    id: MCP_ELICITATION_ACTION_QUESTION_ID,
    header: params.serverName || "MCP request",
    question,
    options: [
      { label: ACCEPT_LABEL, description: "Allow this request." },
      { label: DECLINE_LABEL, description: "Decline this request." },
      { label: CANCEL_LABEL, description: "Cancel this request." },
    ],
    multiSelect: false,
  };
}

function formQuestions(params: McpElicitationFormParams): ReadonlyArray<UserInputQuestion> {
  const entries = Object.entries(params.requestedSchema.properties);
  if (entries.length === 0) {
    return [actionQuestion(params)];
  }

  return entries.map(([id, schema]) => ({
    id,
    header: titleForProperty(id, schema),
    question: descriptionForProperty(id, schema) ?? titleForProperty(id, schema),
    options: optionsForSchema(schema),
    multiSelect: isMultiSelectSchema(schema),
  }));
}

export function mcpElicitationQuestions(
  params: McpElicitationParams,
): ReadonlyArray<UserInputQuestion> {
  if (params.mode === "url") {
    return [actionQuestion(params)];
  }
  return formQuestions(params);
}

function answerStrings(value: ProviderUserInputAnswers[string]): ReadonlyArray<string> {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  const record = toRecord(value);
  return Array.isArray(record.answers)
    ? record.answers.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function actionFromAnswer(
  value: ProviderUserInputAnswers[string],
): McpElicitationAction | undefined {
  const normalized = answerStrings(value)[0]?.trim().toLowerCase();
  switch (normalized) {
    case "allow":
    case "accept":
    case "yes":
    case "true":
      return "accept";
    case "decline":
    case "deny":
    case "no":
    case "false":
      return "decline";
    case "cancel":
      return "cancel";
    default:
      return undefined;
  }
}

function coerceAnswerForSchema(
  questionId: string,
  schema: McpElicitationPrimitiveSchema,
  value: ProviderUserInputAnswers[string],
): { readonly _tag: "Ok"; readonly value: unknown } | { readonly _tag: "InvalidAnswer" } {
  const record = toRecord(schema);
  const values = answerStrings(value);
  if (record.type === "array") {
    return { _tag: "Ok", value: [...values] };
  }

  const first = values[0];
  if (first === undefined) {
    return { _tag: "InvalidAnswer" };
  }

  if (record.type === "boolean") {
    const normalized = first.trim().toLowerCase();
    if (["true", "yes", "allow", "accept"].includes(normalized)) {
      return { _tag: "Ok", value: true };
    }
    if (["false", "no", "decline", "deny", "cancel"].includes(normalized)) {
      return { _tag: "Ok", value: false };
    }
    return { _tag: "InvalidAnswer" };
  }

  if (record.type === "number" || record.type === "integer") {
    const parsed = Number(first);
    if (!Number.isFinite(parsed)) {
      return { _tag: "InvalidAnswer" };
    }
    return {
      _tag: "Ok",
      value: record.type === "integer" ? Math.trunc(parsed) : parsed,
    };
  }

  if (!questionId) {
    return { _tag: "InvalidAnswer" };
  }
  return { _tag: "Ok", value: first };
}

function formContentFromAnswers(
  params: McpElicitationFormParams,
  answers: ProviderUserInputAnswers,
):
  | { readonly _tag: "Ok"; readonly content: Record<string, unknown> }
  | {
      readonly _tag: "InvalidAnswer";
      readonly questionId: string;
    } {
  const content: Record<string, unknown> = {};
  for (const [questionId, schema] of Object.entries(params.requestedSchema.properties)) {
    const coerced = coerceAnswerForSchema(questionId, schema, answers[questionId]);
    if (coerced._tag === "InvalidAnswer") {
      return { _tag: "InvalidAnswer", questionId };
    }
    content[questionId] = coerced.value;
  }
  return { _tag: "Ok", content };
}

export function mcpElicitationResponseFromAnswers(
  params: McpElicitationParams,
  answers: ProviderUserInputAnswers,
): McpElicitationResponseResult {
  const action = actionFromAnswer(answers[MCP_ELICITATION_ACTION_QUESTION_ID]);
  if (action && action !== "accept") {
    return { _tag: "Ok", response: { action } };
  }

  if (params.mode === "url") {
    return action === "accept"
      ? { _tag: "Ok", response: { action: "accept" } }
      : { _tag: "InvalidAnswer", questionId: MCP_ELICITATION_ACTION_QUESTION_ID };
  }

  if (Object.keys(params.requestedSchema.properties).length === 0) {
    return action === "accept"
      ? { _tag: "Ok", response: { action: "accept", content: {} } }
      : { _tag: "InvalidAnswer", questionId: MCP_ELICITATION_ACTION_QUESTION_ID };
  }

  const content = formContentFromAnswers(params, answers);
  if (content._tag === "InvalidAnswer") {
    return content;
  }
  return {
    _tag: "Ok",
    response: {
      action: "accept",
      content: content.content,
    },
  };
}
