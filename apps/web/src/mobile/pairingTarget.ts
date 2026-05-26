import { getPairingTokenFromUrl } from "../pairingUrl";
import { readHostedPairingRequest } from "../hostedPairing";

export type MobileConnectionMode = "tailscale" | "lan";

export interface ResolvedMobilePairingTarget {
  readonly credential: string;
  readonly suggestedHttpBaseUrl: string | null;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

export type MobilePairingInputKind = "token" | "pairing-url" | "hosted-pairing-url";

export interface MobilePairingInputAnalysis {
  readonly kind: MobilePairingInputKind;
  readonly credential: string | null;
  readonly suggestedHttpBaseUrl: string | null;
  readonly detectedMode: MobileConnectionMode | null;
  readonly canAutoPair: boolean;
}

function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value);
}

function isPairingUrlLike(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes("://") || trimmed.startsWith("/");
}

export function shouldRequireExplicitMobileHost(input: {
  readonly mode: MobileConnectionMode;
  readonly pairingInput: string;
  readonly host: string;
}): boolean {
  return (
    input.mode === "tailscale" &&
    input.host.trim().length === 0 &&
    !isPairingUrlLike(input.pairingInput)
  );
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

function inferMobileConnectionModeFromBaseUrl(url: URL): MobileConnectionMode | null {
  const hostname = url.hostname.toLowerCase();
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
}

export function inferMobileConnectionModeFromPairingInput(
  rawValue: string,
): MobileConnectionMode | null {
  const trimmed = rawValue.trim();
  if (!isPairingUrlLike(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    const hostedPairingRequest = readHostedPairingRequest(url);
    return inferMobileConnectionModeFromBaseUrl(
      hostedPairingRequest ? normalizeMobileBaseUrl(hostedPairingRequest.host) : url,
    );
  } catch {
    return null;
  }
}

function normalizeMobileBaseUrl(rawValue: string): URL {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Enter the backend host.");
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
  const hostedPairingRequest = readHostedPairingRequest(url);
  if (hostedPairingRequest) {
    return {
      credential: hostedPairingRequest.token,
      suggestedHttpBaseUrl: toHttpBaseUrl(normalizeMobileBaseUrl(hostedPairingRequest.host)),
    };
  }

  const credential = getPairingTokenFromUrl(url) ?? "";
  if (!credential) {
    throw new Error("The pairing URL does not include a token.");
  }
  return {
    credential,
    suggestedHttpBaseUrl: toHttpBaseUrl(url),
  };
}

export function analyzeMobilePairingInput(rawValue: string): MobilePairingInputAnalysis {
  const pairingInput = rawValue.trim();
  if (!pairingInput || !isPairingUrlLike(pairingInput)) {
    return {
      kind: "token",
      credential: pairingInput || null,
      suggestedHttpBaseUrl: null,
      detectedMode: null,
      canAutoPair: false,
    };
  }

  try {
    const url = new URL(pairingInput, window.location.origin);
    const hostedPairingRequest = readHostedPairingRequest(url);
    const parsed = parsePairingUrl(pairingInput);
    const baseUrl = normalizeMobileBaseUrl(
      hostedPairingRequest ? hostedPairingRequest.host : parsed.suggestedHttpBaseUrl,
    );

    return {
      kind: hostedPairingRequest ? "hosted-pairing-url" : "pairing-url",
      credential: parsed.credential,
      suggestedHttpBaseUrl: toHttpBaseUrl(baseUrl),
      detectedMode: inferMobileConnectionModeFromBaseUrl(baseUrl),
      canAutoPair: true,
    };
  } catch {
    return {
      kind: "token",
      credential: pairingInput,
      suggestedHttpBaseUrl: null,
      detectedMode: null,
      canAutoPair: false,
    };
  }
}

export function shouldAutoPairMobileInput(rawValue: string): boolean {
  return analyzeMobilePairingInput(rawValue).canAutoPair;
}

function inheritPortFromPairingUrl(input: {
  readonly normalizedHost: URL;
  readonly suggestedHttpBaseUrl: string | null | undefined;
}): URL {
  if (input.normalizedHost.port || !input.suggestedHttpBaseUrl) {
    return input.normalizedHost;
  }

  const suggestedUrl = new URL(input.suggestedHttpBaseUrl, window.location.origin);
  if (!suggestedUrl.port) {
    return input.normalizedHost;
  }

  const next = new URL(input.normalizedHost.toString());
  next.port = suggestedUrl.port;
  return next;
}

export function resolveMobilePairingTarget(input: {
  readonly pairingUrlOrToken: string;
  readonly host: string;
}): ResolvedMobilePairingTarget {
  const pairingInput = input.pairingUrlOrToken.trim();
  if (!pairingInput) {
    throw new Error("Enter a pairing token or URL.");
  }

  const fromPairingUrl = (() => {
    if (!isPairingUrlLike(pairingInput)) {
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
  const normalizedHost = inheritPortFromPairingUrl({
    normalizedHost: normalizeMobileBaseUrl(host),
    suggestedHttpBaseUrl: fromPairingUrl?.suggestedHttpBaseUrl,
  });

  return {
    credential,
    suggestedHttpBaseUrl: fromPairingUrl?.suggestedHttpBaseUrl ?? null,
    httpBaseUrl: toHttpBaseUrl(normalizedHost),
    wsBaseUrl: toWsBaseUrl(normalizedHost),
  };
}
