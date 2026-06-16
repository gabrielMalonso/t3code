import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServer } from "effect/unstable/http";

import { ServerConfig } from "../config.ts";
import { ServerEnvironment } from "../environment/Services/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-1");
const fakeHttpServer = HttpServer.HttpServer.of({
  address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 43123 },
  serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
});
const fakeEnvironment = ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeRegistry = (now: () => number) =>
  McpSessionRegistry.__testing
    .make({
      now,
      idleTimeoutMs: 100,
      maximumLifetimeMs: 1_000,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, fakeHttpServer),
      Effect.provideService(ServerEnvironment, fakeEnvironment),
      Effect.provide(NodeServices.layer),
    );

const makeRegistryLayer = (previewMcpEnabled: boolean) =>
  McpSessionRegistry.layer.pipe(
    Layer.provide(Layer.succeed(HttpServer.HttpServer, fakeHttpServer)),
    Layer.provide(Layer.succeed(ServerEnvironment, fakeEnvironment)),
    Layer.provide(
      Layer.effect(
        ServerConfig,
        Effect.gen(function* () {
          const config = yield* ServerConfig;
          return { ...config, previewMcpEnabled };
        }).pipe(
          Effect.provide(
            ServerConfig.layerTest(process.cwd(), { prefix: "t3-mcp-registry-test-" }),
          ),
        ),
      ),
    ),
    Layer.provide(NodeServices.layer),
  );

it.effect("stores only a token hash, resolves the bearer token, and revokes by thread", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-1");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(issued.config.endpoint).toBe("http://127.0.0.1:43123/mcp");
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("expires credentials after inactivity", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-2"),
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect("does not issue active credentials when preview MCP is disabled", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* McpSessionRegistry.McpSessionRegistry;
      const credential = yield* McpSessionRegistry.issueActiveMcpCredential({
        threadId: ThreadId.make("thread-disabled"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      });
      expect(credential).toBeUndefined();
    }),
  ).pipe(Effect.provide(makeRegistryLayer(false))),
);

it.effect("issues active credentials when preview MCP is enabled", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* McpSessionRegistry.McpSessionRegistry;
      const credential = yield* McpSessionRegistry.issueActiveMcpCredential({
        threadId: ThreadId.make("thread-enabled"),
        providerInstanceId: ProviderInstanceId.make("codex"),
      });
      expect(credential?.config.endpoint).toBe("http://127.0.0.1:43123/mcp");
    }),
  ).pipe(Effect.provide(makeRegistryLayer(true))),
);
