export const THREAD_LOOP_MIN_INTERVAL_MINUTES = 1;

export const computeThreadLoopNextRunAt = (fromIso: string, intervalMinutes: number): string =>
  new Date(Date.parse(fromIso) + intervalMinutes * 60_000).toISOString();
