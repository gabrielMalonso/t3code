import { getPairingTokenFromUrl } from "../pairingUrl";

export type MobileConnectionMode = "tailscale" | "lan";

export interface ResolvedMobilePairingTarget {
  readonly credential: string;
  readonly suggestedHttpBaseUrl: string | null;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value);
}

function isPrivateOrTailscaleHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.startsWith("100.") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    normalized.endsWith(".ts.net")
  );
}

export function inferMobileConnectionModeFromPairingInput(
  rawValue: string,
): MobileConnectionMode | null {
  const trimmed = rawValue.trim();
  if (!trimmed.includes("://") && !trimmed.startsWith("/")) {
    return null;
  }

  try {
    const hostname = new URL(trimmed, window.location.origin).hostname.toLowerCase();
    if (hostname.startsWith("100.") || hostname.endsWith(".ts.net")) {
      return "tailscale";
    }
    if (
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return "lan";
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeMobileBaseUrl(rawValue: string): URL {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Informe o host do backend.");
  }

  const valueWithScheme = hasScheme(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(valueWithScheme, window.location.origin);
  if (!hasScheme(trimmed) && !isPrivateOrTailscaleHost(url.hostname)) {
    url.protocol = "http:";
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function toHttpBaseUrl(url: URL): string {
  const next = new URL(url.toString());
  if (next.protocol === "ws:") {
    next.protocol = "http:";
  } else if (next.protocol === "wss:") {
    next.protocol = "https:";
  }
  next.pathname = "/";
  next.search = "";
  next.hash = "";
  return next.toString();
}

function toWsBaseUrl(url: URL): string {
  const next = new URL(url.toString());
  if (next.protocol === "http:") {
    next.protocol = "ws:";
  } else if (next.protocol === "https:") {
    next.protocol = "wss:";
  }
  next.pathname = "/";
  next.search = "";
  next.hash = "";
  return next.toString();
}

function parsePairingUrl(rawValue: string): { credential: string; suggestedHttpBaseUrl: string } {
  const url = new URL(rawValue, window.location.origin);
  const credential = getPairingTokenFromUrl(url) ?? "";
  if (!credential) {
    throw new Error("A URL de pareamento nao tem token.");
  }
  return {
    credential,
    suggestedHttpBaseUrl: toHttpBaseUrl(url),
  };
}

export function resolveMobilePairingTarget(input: {
  readonly pairingUrlOrToken: string;
  readonly host: string;
}): ResolvedMobilePairingTarget {
  const pairingInput = input.pairingUrlOrToken.trim();
  if (!pairingInput) {
    throw new Error("Informe o token ou a URL de pareamento.");
  }

  const fromPairingUrl = (() => {
    if (!pairingInput.includes("://") && !pairingInput.startsWith("/")) {
      return null;
    }
    try {
      return parsePairingUrl(pairingInput);
    } catch {
      return null;
    }
  })();

  const credential = fromPairingUrl?.credential ?? pairingInput;
  const host = input.host.trim() || fromPairingUrl?.suggestedHttpBaseUrl || "";
  const normalizedHost = normalizeMobileBaseUrl(host);

  return {
    credential,
    suggestedHttpBaseUrl: fromPairingUrl?.suggestedHttpBaseUrl ?? null,
    httpBaseUrl: toHttpBaseUrl(normalizedHost),
    wsBaseUrl: toWsBaseUrl(normalizedHost),
  };
}
