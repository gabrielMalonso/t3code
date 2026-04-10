import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

const ProviderCommandsProviderKind = Schema.Literals(["codex", "claudeAgent"]);

export const ProviderCommandSource = Schema.Literals(["user", "project", "builtin"]);
export type ProviderCommandSource = typeof ProviderCommandSource.Type;

export const ProviderCommandEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  path: Schema.optional(TrimmedNonEmptyString),
  source: ProviderCommandSource,
});
export type ProviderCommandEntry = typeof ProviderCommandEntry.Type;

export const ProviderSkillReference = Schema.Struct({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
});
export type ProviderSkillReference = typeof ProviderSkillReference.Type;

export const ProviderCommandsListInput = Schema.Struct({
  provider: ProviderCommandsProviderKind,
  cwd: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderCommandsListInput = typeof ProviderCommandsListInput.Type;

export const ProviderCommandsListResult = Schema.Struct({
  provider: ProviderCommandsProviderKind,
  commands: Schema.Array(ProviderCommandEntry),
  skills: Schema.Array(ProviderCommandEntry),
});
export type ProviderCommandsListResult = typeof ProviderCommandsListResult.Type;

export class ProviderCommandsListError extends Schema.TaggedErrorClass<ProviderCommandsListError>()(
  "ProviderCommandsListError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
