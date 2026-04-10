import type { EnvironmentId, ProviderCommandsListResult, ProviderKind } from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureEnvironmentApi } from "~/environmentApi";

const EMPTY_PROVIDER_COMMANDS_RESULT: ProviderCommandsListResult = {
  provider: "codex",
  commands: [],
  skills: [],
};

export const providerCommandsQueryKeys = {
  all: ["provider-commands"] as const,
  list: (environmentId: EnvironmentId | null, provider: ProviderKind, cwd: string | null) =>
    ["provider-commands", environmentId ?? null, provider, cwd] as const,
};

export function providerCommandsQueryOptions(input: {
  environmentId: EnvironmentId | null;
  provider: ProviderKind;
  cwd: string | null;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: providerCommandsQueryKeys.list(input.environmentId, input.provider, input.cwd),
    queryFn: async () => {
      if (!input.environmentId) {
        throw new Error("Provider command discovery is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      return api.projects.listProviderCommands({
        provider: input.provider,
        ...(input.cwd ? { cwd: input.cwd } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null,
    staleTime: input.staleTime ?? 15_000,
    placeholderData: (previous) =>
      previous ?? {
        ...EMPTY_PROVIDER_COMMANDS_RESULT,
        provider: input.provider,
      },
  });
}
