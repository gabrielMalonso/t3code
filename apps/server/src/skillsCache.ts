/**
 * In-memory cache for SDK-discovered skills, keyed by project cwd.
 * Shared between the session manager (writes) and the server config endpoint (reads).
 */
const cache = new Map<string, string[]>();

export function updateDiscoveredSkillsCache(cwd: string, skills: string[]): void {
  if (skills.length > 0) {
    cache.set(cwd, skills);
  }
}

export function getDiscoveredSkillsCache(cwd: string): string[] {
  return cache.get(cwd) ?? [];
}
