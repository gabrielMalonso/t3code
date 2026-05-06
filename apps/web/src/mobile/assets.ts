import type { EnvironmentId } from "@t3tools/contracts";

import { getActiveMobileProfile } from "./runtime";

type BlobCacheEntry = {
  readonly blobUrl: string;
};

const blobUrlCache = new Map<string, BlobCacheEntry>();

function cacheKey(profileId: string, url: string): string {
  return `${profileId}:${url}`;
}

export function isMobileBearerAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.pathname.startsWith("/attachments/") || parsed.pathname === "/api/project-favicon"
    );
  } catch {
    return false;
  }
}

export async function resolveMobileBearerAssetBlobUrl(input: {
  readonly environmentId: EnvironmentId;
  readonly url: string;
}): Promise<string> {
  const profile = getActiveMobileProfile();
  if (!profile || profile.environmentId !== input.environmentId) {
    return input.url;
  }

  const key = cacheKey(profile.profileId, input.url);
  const cached = blobUrlCache.get(key);
  if (cached) {
    return cached.blobUrl;
  }

  const response = await fetch(input.url, {
    headers: {
      authorization: `Bearer ${profile.bearerToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Falha ao carregar asset autenticado (${response.status}).`);
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  blobUrlCache.set(key, { blobUrl });
  return blobUrl;
}

export function revokeMobileBearerAssetBlobUrls(profileId?: string): void {
  for (const [key, entry] of blobUrlCache) {
    if (profileId && !key.startsWith(`${profileId}:`)) {
      continue;
    }
    URL.revokeObjectURL(entry.blobUrl);
    blobUrlCache.delete(key);
  }
}
