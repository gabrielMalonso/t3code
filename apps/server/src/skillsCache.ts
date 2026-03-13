import type { ProviderKind } from "@t3tools/contracts";

/**
 * In-memory cache for SDK-discovered skills, keyed by project cwd + provider.
 * Shared between the session manager (writes) and the server config endpoint (reads).
 */
const cache = new Map<string, string[]>();

function keyFor(cwd: string, provider: ProviderKind): string {
  return `${provider}\u0000${cwd}`;
}

export function updateDiscoveredSkillsCache(
  cwd: string,
  provider: ProviderKind,
  skills: string[],
): void {
  if (skills.length > 0) {
    cache.set(keyFor(cwd, provider), skills);
  }
}

export function getDiscoveredSkillsCache(cwd: string, provider: ProviderKind): string[] {
  return cache.get(keyFor(cwd, provider)) ?? [];
}

export function resetDiscoveredSkillsCache(): void {
  cache.clear();
}
