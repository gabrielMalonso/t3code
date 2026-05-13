import { DEFAULT_SERVER_SETTINGS, type OpenPetsRuntimeStatus } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import {
  ProcessRunner,
  type ProcessRunError,
  type ProcessRunInput,
  type ProcessRunOutput,
  type ProcessRunnerShape,
} from "../processRunner.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import type { OpenPetsBridgeShape, OpenPetsNotifyInput } from "./Services/OpenPetsBridge.ts";

const NOTIFY_TIMEOUT_MS = 1_500;
const PING_TIMEOUT_MS = 1_500;
const THREAD_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_THREAD_RECORDS = 1_000;
const MAX_TEXT_LENGTH = 180;
const MAX_ERROR_LENGTH = 240;

class OpenPetsProcessError extends Data.TaggedError("OpenPetsProcessError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

interface OpenPetsThreadRecord {
  readonly threadId: string;
  readonly updatedAtMs: number;
}

interface OpenPetsRuntimeState {
  readonly cliAvailable: boolean;
  readonly petReachable: boolean;
  readonly lastError: string | null;
  readonly lastEventAt: string | null;
  readonly threads: Map<string, OpenPetsThreadRecord>;
}

export interface OpenPetsBridgeOptions {
  readonly platform?: NodeJS.Platform;
  readonly runProcess?: ProcessRunnerShape["run"];
}

const initialState: OpenPetsRuntimeState = {
  cliAvailable: false,
  petReachable: false,
  lastError: null,
  lastEventAt: null,
  threads: new Map(),
};

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return truncate(message, MAX_ERROR_LENGTH);
}

function isCommandNotFoundMessage(message: string): boolean {
  return message.startsWith("Command not found:");
}

function normalizeText(value: string): string {
  const trimmed = value.trim();
  return truncate(trimmed.length > 0 ? trimmed : "Status updated.", MAX_TEXT_LENGTH);
}

function pruneThreadRecords(
  threads: Map<string, OpenPetsThreadRecord>,
  nowMs: number,
): Map<string, OpenPetsThreadRecord> {
  const freshEntries = [...threads.entries()]
    .filter(([, record]) => nowMs - record.updatedAtMs <= THREAD_TTL_MS)
    .toSorted((left, right) => right[1].updatedAtMs - left[1].updatedAtMs)
    .slice(0, MAX_THREAD_RECORDS);
  return new Map(freshEntries);
}

function statusFromState(input: {
  readonly state: OpenPetsRuntimeState;
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly binaryPath: string;
}): OpenPetsRuntimeStatus {
  return {
    supported: input.supported,
    enabled: input.enabled,
    binaryPath: input.binaryPath,
    cliAvailable: input.state.cliAvailable,
    petReachable: input.state.petReachable,
    lastError: input.state.lastError,
    lastEventAt: input.state.lastEventAt,
  };
}

export const makeOpenPetsBridge = (options: OpenPetsBridgeOptions = {}) =>
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const processRunner = yield* ProcessRunner;
    const stateRef = yield* Ref.make<OpenPetsRuntimeState>(initialState);
    const platform = options.platform ?? process.platform;
    const run = options.runProcess ?? processRunner.run;
    const supported = platform === "darwin";

    const readOpenPetsSettings = serverSettings.getSettings.pipe(
      Effect.map((settings) => settings.openPets),
      Effect.catch((error) =>
        Effect.logWarning("failed to read OpenPets settings", { error: error.message }).pipe(
          Effect.as(DEFAULT_SERVER_SETTINGS.openPets),
        ),
      ),
    );

    const updateState = (
      f: (state: OpenPetsRuntimeState) => OpenPetsRuntimeState,
    ): Effect.Effect<OpenPetsRuntimeState> => Ref.updateAndGet(stateRef, f);

    const recordPingFailure = (error: OpenPetsProcessError) => {
      const message = errorMessage(error);
      return updateState((state) => ({
        ...state,
        cliAvailable: !isCommandNotFoundMessage(message),
        petReachable: false,
        lastError: message,
      }));
    };

    const recordNotifyFailure = (error: OpenPetsProcessError) => {
      const message = errorMessage(error);
      const commandNotFound = isCommandNotFoundMessage(message);
      return updateState((state) => ({
        ...state,
        cliAvailable: !commandNotFound,
        petReachable: commandNotFound ? false : state.petReachable,
        lastError: message,
      }));
    };

    const runOpenPets = (
      binaryPath: string,
      args: readonly string[],
      timeoutMs: number,
    ): Effect.Effect<ProcessRunOutput, OpenPetsProcessError> =>
      run({
        command: binaryPath,
        args,
        timeout: Duration.millis(timeoutMs),
        maxOutputBytes: 4_096,
        outputMode: "truncate",
      } satisfies ProcessRunInput).pipe(
        Effect.mapError(
          (error: ProcessRunError) =>
            new OpenPetsProcessError({
              cause: error,
              message: errorMessage(error),
            }),
        ),
        Effect.flatMap((result) => {
          if (result.timedOut || result.code === null || result.code !== 0) {
            return Effect.fail(
              new OpenPetsProcessError({
                cause: result,
                message: result.stderr.trim() || `openpets exited with code ${result.code}.`,
              }),
            );
          }
          return Effect.succeed(result);
        }),
      );

    const refreshStatus: OpenPetsBridgeShape["refreshStatus"] = Effect.gen(function* () {
      const settings = yield* readOpenPetsSettings;
      const current = yield* Ref.get(stateRef);

      if (!supported || !settings.enabled) {
        return statusFromState({
          state: current,
          supported,
          enabled: settings.enabled,
          binaryPath: settings.binaryPath,
        });
      }

      const result = yield* runOpenPets(settings.binaryPath, ["ping"], PING_TIMEOUT_MS).pipe(
        Effect.matchEffect({
          onFailure: (error) => recordPingFailure(error),
          onSuccess: () =>
            updateState((state) => ({
              ...state,
              cliAvailable: true,
              petReachable: true,
              lastError: null,
            })),
        }),
      );

      return statusFromState({
        state: result,
        supported,
        enabled: settings.enabled,
        binaryPath: settings.binaryPath,
      });
    });

    const getStatus: OpenPetsBridgeShape["getStatus"] = Effect.gen(function* () {
      const settings = yield* readOpenPetsSettings;
      const state = yield* Ref.get(stateRef);
      return statusFromState({
        state,
        supported,
        enabled: settings.enabled,
        binaryPath: settings.binaryPath,
      });
    });

    const notify: OpenPetsBridgeShape["notify"] = (input: OpenPetsNotifyInput) =>
      Effect.gen(function* () {
        const settings = yield* readOpenPetsSettings;
        if (!supported || !settings.enabled) {
          return;
        }

        const nowMs = yield* Clock.currentTimeMillis;
        const current = yield* Ref.get(stateRef);
        const prunedThreads = pruneThreadRecords(current.threads, nowMs);
        const existingThread = prunedThreads.get(input.key)?.threadId;
        const args = [
          "notify",
          ...(existingThread ? ["--thread", existingThread] : []),
          "--title",
          input.title,
          "--status",
          input.status,
          "--text",
          normalizeText(input.text),
        ];

        const result = yield* runOpenPets(settings.binaryPath, args, NOTIFY_TIMEOUT_MS).pipe(
          Effect.matchEffect({
            onFailure: (error) => recordNotifyFailure(error).pipe(Effect.as(null)),
            onSuccess: (processResult) => Effect.succeed(processResult),
          }),
        );

        if (result === null) {
          return;
        }

        const returnedThreadId = result.stdout.trim();
        const nextThreadId = returnedThreadId.length > 0 ? returnedThreadId : existingThread;
        const eventAt = DateTime.formatIso(yield* DateTime.now);
        yield* updateState((state) => {
          const threads = pruneThreadRecords(state.threads, nowMs);
          if (nextThreadId) {
            threads.set(input.key, {
              threadId: nextThreadId,
              updatedAtMs: nowMs,
            });
          }
          return {
            ...state,
            cliAvailable: true,
            petReachable: true,
            lastError: null,
            lastEventAt: eventAt,
            threads,
          };
        });
      });

    return {
      notify,
      getStatus,
      refreshStatus,
    } satisfies OpenPetsBridgeShape;
  });
