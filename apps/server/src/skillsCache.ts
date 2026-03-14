import type { ProviderKind, ServerAvailableSkillDescriptor } from "@t3tools/contracts";

/**
 * In-memory cache for SDK-discovered skills, keyed by project cwd + provider.
 * Shared between the session manager (writes) and the server config endpoint (reads).
 */
interface CachedSkillsEntry {
  readonly names: string[];
  readonly descriptors: ServerAvailableSkillDescriptor[];
}

const cache = new Map<string, CachedSkillsEntry>();

function keyFor(cwd: string, provider: ProviderKind): string {
  return `${provider}\u0000${cwd}`;
}

export function updateDiscoveredSkillsCache(
  cwd: string,
  provider: ProviderKind,
  skills: string[],
): void {
  if (skills.length > 0) {
    cache.set(keyFor(cwd, provider), {
      names: skills,
      descriptors: skills.map((name) => ({ name })),
    });
  }
}

export function getDiscoveredSkillsCache(cwd: string, provider: ProviderKind): string[] {
  return cache.get(keyFor(cwd, provider))?.names ?? [];
}

export function updateDiscoveredSkillCatalogCache(
  cwd: string,
  provider: ProviderKind,
  skills: ServerAvailableSkillDescriptor[],
): void {
  if (skills.length > 0) {
    cache.set(keyFor(cwd, provider), {
      names: skills.map((skill) => skill.name),
      descriptors: skills,
    });
  }
}

export function getDiscoveredSkillCatalogCache(
  cwd: string,
  provider: ProviderKind,
): ServerAvailableSkillDescriptor[] {
  return cache.get(keyFor(cwd, provider))?.descriptors ?? [];
}

export function resetDiscoveredSkillsCache(): void {
  cache.clear();
}
