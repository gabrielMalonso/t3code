import { getPairingTokenFromUrl, setPairingTokenOnUrl } from "../pairingUrl";
import { readHostedPairingRequest } from "../hostedPairing";
import {
  inferMobileConnectionModeFromPairingInput,
  type MobileConnectionMode,
} from "./pairingTarget";

export interface MobilePairingDeepLink {
  readonly pairingInput: string;
  readonly host: string;
  readonly mode: MobileConnectionMode;
}

const MOBILE_APP_SCHEME = "tools.t3code.mobile:";

function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value);
}

function isPairRoute(url: URL): boolean {
  const path = url.pathname.replace(/^\/+/, "");
  return url.hostname === "pair" || path === "pair";
}

function searchParam(url: URL, names: ReadonlyArray<string>): string {
  for (const name of names) {
    const value = url.searchParams.get(name)?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function parseMode(value: string): MobileConnectionMode | null {
  return value === "lan" || value === "tailscale" ? value : null;
}

function inferModeFromHost(host: string): MobileConnectionMode | null {
  const trimmed = host.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(hasScheme(trimmed) ? trimmed : `http://${trimmed}`);
    const hostname = url.hostname.toLowerCase();
    if (hostname.startsWith("100.") || hostname.endsWith(".ts.net")) {
      return "tailscale";
    }
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return "lan";
    }
  } catch {
    return null;
  }

  return null;
}

function inferModeFromPairingUrl(pairingUrl: string): MobileConnectionMode | null {
  try {
    const url = new URL(pairingUrl, "http://localhost");
    const hostedPairingRequest = readHostedPairingRequest(url);
    return inferModeFromHost(hostedPairingRequest?.host ?? url.hostname);
  } catch {
    return null;
  }
}

function buildPairingUrlFromHost(host: string, token: string): string {
  const url = new URL(hasScheme(host) ? host : `http://${host}`);
  url.pathname = "/pair";
  url.search = "";
  url.hash = "";
  return setPairingTokenOnUrl(url, token).toString();
}

export function parseMobilePairingDeepLink(rawUrl: string): MobilePairingDeepLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== MOBILE_APP_SCHEME || !isPairRoute(url)) {
    return null;
  }

  const host = searchParam(url, ["host", "backend", "baseUrl"]);
  const explicitMode = parseMode(searchParam(url, ["mode"]));
  const pairingUrl = searchParam(url, ["pairingUrl", "url"]);
  if (pairingUrl) {
    return {
      pairingInput: pairingUrl,
      host,
      mode:
        explicitMode ??
        inferModeFromPairingUrl(pairingUrl) ??
        inferMobileConnectionModeFromPairingInput(pairingUrl) ??
        inferModeFromHost(host) ??
        "tailscale",
    };
  }

  const token = getPairingTokenFromUrl(url)?.trim() ?? "";
  if (!token) {
    return null;
  }

  const mode = explicitMode ?? inferModeFromHost(host) ?? "tailscale";
  return {
    pairingInput: mode === "lan" && host ? buildPairingUrlFromHost(host, token) : token,
    host: mode === "lan" ? "" : host,
    mode,
  };
}
