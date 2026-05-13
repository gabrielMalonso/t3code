import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { DEFAULT_SERVER_SETTINGS, type ServerSettings } from "@t3tools/contracts";
import { ServerSettingsService } from "../serverSettings.ts";
import { makeOpenPetsBridge, OpenPetsProcessError } from "./OpenPetsBridge.ts";
import type { ProcessRunInput, ProcessRunOutput } from "../processRunner.ts";

type RunCall = ProcessRunInput;

const processResult = (stdout = ""): ProcessRunOutput => ({
  stdout,
  stderr: "",
  code: ChildProcessSpawner.ExitCode(0),
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
});

function makeRunProcessStub(handler?: (call: RunCall, index: number) => ProcessRunOutput) {
  const calls: RunCall[] = [];
  const run = (input: ProcessRunInput): Effect.Effect<ProcessRunOutput, OpenPetsProcessError> => {
    const call = input;
    calls.push(call);
    try {
      return Effect.succeed(
        handler ? handler(call, calls.length - 1) : processResult("openpets-thread-1\n"),
      );
    } catch (error) {
      return Effect.fail(
        new OpenPetsProcessError({
          cause: error,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
  return { calls, run };
}

function makeBridge(input: {
  readonly settings?: Partial<ServerSettings>;
  readonly platform?: NodeJS.Platform;
  readonly runProcess?: ReturnType<typeof makeRunProcessStub>["run"];
}) {
  return makeOpenPetsBridge({
    platform: input.platform ?? "darwin",
    ...(input.runProcess ? { runProcess: input.runProcess } : {}),
  }).pipe(Effect.provide(ServerSettingsService.layerTest(input.settings ?? {})));
}

describe("OpenPetsBridge", () => {
  it("does not call the CLI while disabled", async () => {
    const runProcess = makeRunProcessStub();
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: false, binaryPath: "openpets" } },
        runProcess: runProcess.run,
      }),
    );

    await Effect.runPromise(
      bridge.notify({
        key: "thread-1:turn-1",
        title: "T3 Code",
        status: "running",
        text: "Working.",
      }),
    );
    const status = await Effect.runPromise(bridge.refreshStatus);

    expect(runProcess.calls).toHaveLength(0);
    expect(status).toEqual({
      supported: true,
      enabled: false,
      binaryPath: "openpets",
      cliAvailable: false,
      petReachable: false,
      lastError: null,
      lastEventAt: null,
    });
  });

  it("returns unsupported and no-ops outside macOS", async () => {
    const runProcess = makeRunProcessStub();
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: true, binaryPath: "openpets" } },
        platform: "linux",
        runProcess: runProcess.run,
      }),
    );

    await Effect.runPromise(
      bridge.notify({
        key: "thread-1:turn-1",
        title: "T3 Code",
        status: "running",
        text: "Working.",
      }),
    );
    const status = await Effect.runPromise(bridge.refreshStatus);

    expect(runProcess.calls).toHaveLength(0);
    expect(status.supported).toBe(false);
    expect(status.enabled).toBe(true);
  });

  it("pings OpenPets and updates CLI reachability", async () => {
    const runProcess = makeRunProcessStub(() => processResult("pong\n"));
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: true, binaryPath: "/tmp/openpets" } },
        runProcess: runProcess.run,
      }),
    );

    const status = await Effect.runPromise(bridge.refreshStatus);

    expect(runProcess.calls).toEqual([
      {
        command: "/tmp/openpets",
        args: ["ping"],
        timeout: 1_500,
        maxOutputBytes: 4_096,
        outputMode: "truncate",
      },
    ]);
    expect(status.cliAvailable).toBe(true);
    expect(status.petReachable).toBe(true);
    expect(status.lastError).toBeNull();
  });

  it("sends notify arguments and records the returned thread id", async () => {
    const runProcess = makeRunProcessStub(() => processResult("openpets-thread-1\n"));
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: true, binaryPath: "openpets" } },
        runProcess: runProcess.run,
      }),
    );

    await Effect.runPromise(
      bridge.notify({
        key: "thread-1:turn-1",
        title: "T3 Code",
        status: "running",
        text: "T3 Code is working on this thread.",
      }),
    );

    expect(runProcess.calls[0]?.args).toEqual([
      "notify",
      "--title",
      "T3 Code",
      "--status",
      "running",
      "--text",
      "T3 Code is working on this thread.",
    ]);
    const status = await Effect.runPromise(bridge.getStatus);
    expect(status.lastEventAt).not.toBeNull();
  });

  it("reuses the OpenPets thread id on subsequent notifications with the same key", async () => {
    const runProcess = makeRunProcessStub(() => processResult("openpets-thread-1\n"));
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: true, binaryPath: "openpets" } },
        runProcess: runProcess.run,
      }),
    );

    await Effect.runPromise(
      bridge.notify({
        key: "thread-1:turn-1",
        title: "T3 Code",
        status: "running",
        text: "Working.",
      }),
    );
    await Effect.runPromise(
      bridge.notify({
        key: "thread-1:turn-1",
        title: "T3 Code",
        status: "done",
        text: "Completed.",
      }),
    );

    expect(runProcess.calls[1]?.args).toEqual([
      "notify",
      "--thread",
      "openpets-thread-1",
      "--title",
      "T3 Code",
      "--status",
      "done",
      "--text",
      "Completed.",
    ]);
  });

  it("records CLI failures without throwing", async () => {
    const calls: RunCall[] = [];
    const run = (input: ProcessRunInput): Effect.Effect<ProcessRunOutput, OpenPetsProcessError> => {
      calls.push(input);
      return Effect.fail(
        new OpenPetsProcessError({
          cause: "Command not found: openpets",
          message: "Command not found: openpets",
        }),
      );
    };
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: true, binaryPath: "openpets" } },
        runProcess: run,
      }),
    );

    await expect(
      Effect.runPromise(
        bridge.notify({
          key: "thread-1:turn-1",
          title: "T3 Code",
          status: "running",
          text: "Working.",
        }),
      ),
    ).resolves.toBeUndefined();

    const status = await Effect.runPromise(bridge.getStatus);
    expect(calls).toHaveLength(1);
    expect(status.lastError).toContain("Command not found");
    expect(status.cliAvailable).toBe(false);
    expect(status.petReachable).toBe(false);
  });

  it("records notify failures without erasing known CLI reachability", async () => {
    const runProcess = makeRunProcessStub((_call, index) => {
      if (index === 0) {
        return processResult("openpets-thread-1\n");
      }
      throw new Error("openpets notify failed.");
    });
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: { openPets: { enabled: true, binaryPath: "openpets" } },
        runProcess: runProcess.run,
      }),
    );

    await Effect.runPromise(
      bridge.notify({
        key: "thread-1:turn-1",
        title: "T3 Code",
        status: "running",
        text: "Working.",
      }),
    );
    await expect(
      Effect.runPromise(
        bridge.notify({
          key: "thread-1:turn-1",
          title: "T3 Code",
          status: "done",
          text: "Completed.",
        }),
      ),
    ).resolves.toBeUndefined();

    const status = await Effect.runPromise(bridge.getStatus);
    expect(runProcess.calls).toHaveLength(2);
    expect(status.lastError).toContain("openpets notify failed");
    expect(status.cliAvailable).toBe(true);
    expect(status.petReachable).toBe(true);
  });

  it("uses default OpenPets settings when no persisted config exists", async () => {
    const bridge = await Effect.runPromise(
      makeBridge({
        settings: DEFAULT_SERVER_SETTINGS,
        platform: "linux",
      }),
    );

    const status = await Effect.runPromise(bridge.getStatus);
    expect(status.enabled).toBe(false);
    expect(status.binaryPath).toBe("openpets");
  });
});
