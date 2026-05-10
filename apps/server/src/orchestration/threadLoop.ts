import * as DateTime from "effect/DateTime";

export const THREAD_LOOP_MIN_INTERVAL_MINUTES = 1;

export const computeThreadLoopNextRunAt = (fromIso: string, intervalMinutes: number): string =>
  DateTime.formatIso(
    DateTime.add(DateTime.makeUnsafe(fromIso), {
      minutes: intervalMinutes,
    }),
  );
