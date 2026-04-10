import * as assert from "node:assert/strict";
import * as os from "node:os";

import { afterEach, describe, it, vi } from "vitest";

import { resolveRemoteAccess } from "./remoteAccess";

describe("resolveRemoteAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loopback bindings for loopback-only hosts", () => {
    const result = resolveRemoteAccess({
      authToken: "secret-token",
      host: "127.0.0.1",
      port: 3773,
    });

    assert.equal(result.authRequired, true);
    assert.equal(result.loopbackOnly, true);
    assert.deepEqual(result.bindings, [
      {
        kind: "loopback",
        label: "This device (127.0.0.1)",
        host: "127.0.0.1",
        origin: "http://127.0.0.1:3773",
      },
    ]);
  });

  it("enumerates lan and tailnet bindings for wildcard hosts", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      en0: [
        {
          address: "192.168.0.15",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "192.168.0.15/24",
        },
      ],
      lo0: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
      tailscale0: [
        {
          address: "100.72.12.5",
          netmask: "255.192.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "100.72.12.5/10",
        },
      ],
    });

    const result = resolveRemoteAccess({
      authToken: undefined,
      host: undefined,
      port: 3773,
    });

    assert.equal(result.authRequired, false);
    assert.equal(result.loopbackOnly, false);
    assert.deepEqual(result.bindings, [
      {
        kind: "loopback",
        label: "This device (127.0.0.1)",
        host: "127.0.0.1",
        origin: "http://127.0.0.1:3773",
      },
      {
        kind: "loopback",
        label: "This device (localhost)",
        host: "localhost",
        origin: "http://localhost:3773",
      },
      {
        kind: "lan",
        label: "LAN (en0)",
        host: "192.168.0.15",
        origin: "http://192.168.0.15:3773",
      },
      {
        kind: "tailnet",
        label: "Tailnet (tailscale0)",
        host: "100.72.12.5",
        origin: "http://100.72.12.5:3773",
      },
    ]);
  });
});
