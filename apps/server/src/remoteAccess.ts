import * as os from "node:os";

import type { ServerRemoteAccess, ServerRemoteAccessBinding } from "@t3tools/contracts";

import type { ServerConfigShape } from "./config";

function isWildcardHost(host: string | undefined): boolean {
  return (
    host === undefined || host === "" || host === "0.0.0.0" || host === "::" || host === "[::]"
  );
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function isTailnetAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (normalized.startsWith("100.")) {
    const octets = normalized.split(".");
    const second = Number.parseInt(octets[1] ?? "", 10);
    return Number.isFinite(second) && second >= 64 && second <= 127;
  }
  return normalized.startsWith("fd7a:115c:a1e0:");
}

function formatOrigin(host: string, port: number): string {
  const normalizedHost =
    host.includes(":") && !host.startsWith("[") && !host.endsWith("]") ? `[${host}]` : host;
  return `http://${normalizedHost}:${port}`;
}

function pushBinding(
  bindings: ServerRemoteAccessBinding[],
  seenOrigins: Set<string>,
  binding: ServerRemoteAccessBinding,
): void {
  if (seenOrigins.has(binding.origin)) {
    return;
  }
  seenOrigins.add(binding.origin);
  bindings.push(binding);
}

function classifyHost(host: string): ServerRemoteAccessBinding["kind"] {
  if (isLoopbackHost(host)) return "loopback";
  if (isTailnetAddress(host)) return "tailnet";
  return "custom";
}

function compareBindings(
  left: ServerRemoteAccessBinding,
  right: ServerRemoteAccessBinding,
): number {
  const rank: Record<ServerRemoteAccessBinding["kind"], number> = {
    loopback: 0,
    lan: 1,
    tailnet: 2,
    custom: 3,
  };
  return (
    rank[left.kind] - rank[right.kind] ||
    left.label.localeCompare(right.label) ||
    left.origin.localeCompare(right.origin)
  );
}

export function resolveRemoteAccess(
  config: Pick<ServerConfigShape, "authToken" | "host" | "port">,
): ServerRemoteAccess {
  const bindings: ServerRemoteAccessBinding[] = [];
  const seenOrigins = new Set<string>();

  if (isWildcardHost(config.host)) {
    pushBinding(bindings, seenOrigins, {
      kind: "loopback",
      label: "This device (localhost)",
      host: "localhost",
      origin: formatOrigin("localhost", config.port),
    });
    pushBinding(bindings, seenOrigins, {
      kind: "loopback",
      label: "This device (127.0.0.1)",
      host: "127.0.0.1",
      origin: formatOrigin("127.0.0.1", config.port),
    });

    const interfaces = os.networkInterfaces();
    for (const [name, addresses] of Object.entries(interfaces)) {
      for (const address of addresses ?? []) {
        if (address.internal || address.family !== "IPv4") {
          continue;
        }
        const kind: ServerRemoteAccessBinding["kind"] = isTailnetAddress(address.address)
          ? "tailnet"
          : "lan";
        pushBinding(bindings, seenOrigins, {
          kind,
          label: kind === "tailnet" ? `Tailnet (${name})` : `LAN (${name})`,
          host: address.address,
          origin: formatOrigin(address.address, config.port),
        });
      }
    }
  } else if (config.host) {
    const normalizedHost = config.host.trim();
    pushBinding(bindings, seenOrigins, {
      kind: classifyHost(normalizedHost),
      label: isLoopbackHost(normalizedHost)
        ? `This device (${normalizedHost})`
        : `Bound host (${normalizedHost})`,
      host: normalizedHost,
      origin: formatOrigin(normalizedHost, config.port),
    });
  }

  bindings.sort(compareBindings);

  return {
    port: config.port,
    host: config.host ?? null,
    authRequired: Boolean(config.authToken),
    loopbackOnly: bindings.every((binding) => binding.kind === "loopback"),
    bindings,
  };
}
