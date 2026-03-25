import { DEFAULT_CLAUDE_SETTING_SOURCES, type ClaudeSettingSource } from "@t3tools/contracts";

export function isClaudeSettingSource(value: unknown): value is ClaudeSettingSource {
  return value === "user" || value === "project" || value === "local";
}

export function normalizeClaudeSettingSources(
  sources: Iterable<string | null | undefined> | null | undefined,
): ClaudeSettingSource[] {
  const requested = new Set<ClaudeSettingSource>();

  for (const source of sources ?? []) {
    if (isClaudeSettingSource(source)) {
      requested.add(source);
    }
  }

  const normalized = DEFAULT_CLAUDE_SETTING_SOURCES.filter(
    (source) => requested.size === 0 || requested.has(source),
  );
  return normalized.length > 0 ? [...normalized] : [...DEFAULT_CLAUDE_SETTING_SOURCES];
}
