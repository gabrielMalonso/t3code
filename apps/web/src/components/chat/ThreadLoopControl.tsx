import type { ThreadId } from "@t3tools/contracts";
import {
  AlertCircleIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  RepeatIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ThreadLoop } from "~/types";

const THREAD_LOOP_INTERVAL_PRESETS = [1, 5, 15, 30, 60, 240] as const;

function formatInterval(intervalMinutes: number): string {
  if (intervalMinutes >= 60 && intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60;
    return hours === 1 ? "1h" : `${hours}h`;
  }
  return `${intervalMinutes}m`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "\u2014" : date.toLocaleString();
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);
  if (absDiff < 60_000) return diff > 0 ? "in <1m" : "<1m ago";
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
  }
  const hours = Math.round(absDiff / 3_600_000);
  return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
}

type LoopStatus = "unconfigured" | "active" | "paused" | "error";

function deriveStatus(loop: ThreadLoop | null | undefined): LoopStatus {
  if (!loop) return "unconfigured";
  if (loop.lastError) return "error";
  if (!loop.enabled) return "paused";
  return "active";
}

// ---------------------------------------------------------------------------
// Trigger chip
// ---------------------------------------------------------------------------

const statusChipClasses: Record<LoopStatus, string> = {
  unconfigured:
    "border-input bg-background text-muted-foreground hover:bg-accent/50 dark:bg-input/32 dark:hover:bg-input/48",
  active:
    "border-success/24 bg-success/8 text-success-foreground hover:bg-success/14 dark:border-success/16 dark:bg-success/12 dark:hover:bg-success/18",
  paused:
    "border-input bg-muted/50 text-muted-foreground hover:bg-accent/50 dark:bg-input/20 dark:hover:bg-input/36",
  error:
    "border-warning/24 bg-warning/8 text-warning-foreground hover:bg-warning/14 dark:border-warning/16 dark:bg-warning/12 dark:hover:bg-warning/18",
};

function StatusDot({ status }: { status: LoopStatus }) {
  if (status === "unconfigured") return null;
  if (status === "active") {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60 duration-[2000ms]" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
    );
  }
  if (status === "paused") {
    return <span className="inline-flex size-2 rounded-full bg-muted-foreground/40" />;
  }
  return <span className="inline-flex size-2 rounded-full bg-warning" />;
}

function LoopChipLabel({
  loop,
  status,
  compact,
}: {
  loop: ThreadLoop | null | undefined;
  status: LoopStatus;
  compact?: boolean | undefined;
}) {
  if (status === "unconfigured") {
    return (
      <>
        <RepeatIcon className="size-3.5 opacity-60" />
        <span className={compact ? "sr-only" : "sr-only sm:not-sr-only"}>Loop</span>
      </>
    );
  }
  return (
    <>
      <StatusDot status={status} />
      <span className={compact ? "sr-only" : "sr-only sm:not-sr-only"}>
        {status === "error" ? "Loop error" : status === "paused" ? "Paused" : "Loop"}
      </span>
      {loop ? (
        <span className={compact ? "sr-only" : "sr-only sm:not-sr-only font-mono text-[0.6875rem]"}>
          {formatInterval(loop.intervalMinutes)}
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ThreadLoopControl(props: {
  threadId: ThreadId;
  loop: ThreadLoop | null | undefined;
  compact?: boolean;
  onUpsertLoop: (
    threadId: ThreadId,
    input: {
      enabled: boolean;
      prompt: string;
      intervalMinutes: number;
    },
  ) => Promise<void>;
  onDeleteLoop: (threadId: ThreadId) => Promise<void>;
  onRunNow: (threadId: ThreadId) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(props.loop?.enabled ?? true);
  const [prompt, setPrompt] = useState(props.loop?.prompt ?? "");
  const [intervalMinutes, setIntervalMinutes] = useState(String(props.loop?.intervalMinutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEnabled(props.loop?.enabled ?? true);
    setPrompt(props.loop?.prompt ?? "");
    setIntervalMinutes(String(props.loop?.intervalMinutes ?? 30));
    setError(null);
  }, [open, props.loop]);

  const status = useMemo(() => deriveStatus(props.loop), [props.loop]);

  const tooltipText = useMemo(() => {
    if (!props.loop) return "Configure a recurring loop";
    const lines = [
      props.loop.enabled ? "Loop active" : "Loop paused",
      `Every ${formatInterval(props.loop.intervalMinutes)}`,
    ];
    if (props.loop.nextRunAt) lines.push(`Next: ${formatRelativeTime(props.loop.nextRunAt)}`);
    if (props.loop.lastError) lines.push(`Error: ${props.loop.lastError}`);
    return lines.join("\n");
  }, [props.loop]);

  const handleQuickTogglePause = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (!props.loop || isTogglingPause) return;
      setIsTogglingPause(true);
      try {
        await props.onUpsertLoop(props.threadId, {
          enabled: !props.loop.enabled,
          prompt: props.loop.prompt,
          intervalMinutes: props.loop.intervalMinutes,
        });
      } finally {
        setIsTogglingPause(false);
      }
    },
    [props, isTogglingPause],
  );

  const handleSave = async () => {
    const trimmedPrompt = prompt.trim();
    const parsedInterval = Number.parseInt(intervalMinutes, 10);

    if (trimmedPrompt.length === 0) {
      setError("Prompt is required.");
      return;
    }
    if (!Number.isInteger(parsedInterval) || parsedInterval < 1) {
      setError("Interval must be at least 1 minute.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await props.onUpsertLoop(props.threadId, {
        enabled,
        prompt: trimmedPrompt,
        intervalMinutes: parsedInterval,
      });
      setOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save loop.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await props.onDeleteLoop(props.threadId);
      setOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to delete loop.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRunNow = async () => {
    setError(null);
    setIsRunningNow(true);
    try {
      await props.onRunNow(props.threadId);
      setOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to run now.");
    } finally {
      setIsRunningNow(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* ---- Trigger area: chip + optional quick pause/play ---- */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <SheetTrigger
                render={
                  <button
                    type="button"
                    className={[
                      "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border font-medium outline-none transition-colors duration-150",
                      "h-7 rounded-md px-2 text-xs sm:h-6 sm:text-[0.6875rem]",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      props.loop ? "rounded-r-none border-r-0" : "",
                      statusChipClasses[status],
                    ].join(" ")}
                  />
                }
              />
            }
          >
            <LoopChipLabel loop={props.loop} status={status} compact={props.compact} />
          </TooltipTrigger>
          <TooltipPopup className="max-w-56 whitespace-pre-line">{tooltipText}</TooltipPopup>
        </Tooltip>

        {/* Quick pause/resume toggle — only when loop exists */}
        {props.loop ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={isTogglingPause}
                  onClick={(event) => void handleQuickTogglePause(event)}
                  className={[
                    "inline-flex shrink-0 cursor-pointer items-center justify-center border border-l-0 outline-none transition-colors duration-150",
                    "h-7 w-7 rounded-md rounded-l-none sm:h-6 sm:w-6",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    "disabled:pointer-events-none disabled:opacity-50",
                    statusChipClasses[status],
                  ].join(" ")}
                />
              }
            >
              {props.loop.enabled ? (
                <PauseIcon className="size-3 fill-current" />
              ) : (
                <PlayIcon className="size-3 fill-current" />
              )}
            </TooltipTrigger>
            <TooltipPopup>{props.loop.enabled ? "Pause loop" : "Resume loop"}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>

      {/* ---- Sheet panel ---- */}
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Thread loop</SheetTitle>
          <SheetDescription>
            Configure a recurring prompt that runs automatically on a schedule. The server skips
            ticks while the thread is busy.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-5">
          {/* Status banner when loop exists */}
          {props.loop ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <StatusDot status={status} />
                <span className="text-sm font-medium">
                  {status === "active"
                    ? "Running"
                    : status === "paused"
                      ? "Paused"
                      : status === "error"
                        ? "Error"
                        : "Off"}
                </span>
                {props.loop.nextRunAt && status === "active" ? (
                  <Badge variant="outline" size="sm">
                    Next {formatRelativeTime(props.loop.nextRunAt)}
                  </Badge>
                ) : null}
              </div>
              <Switch id="thread-loop-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="thread-loop-enabled" className="text-sm">
                  Enable loop
                </Label>
                <p className="text-muted-foreground text-xs">
                  The loop will start running after you save.
                </p>
              </div>
              <Switch id="thread-loop-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          )}

          {/* Interval */}
          <div className="space-y-2">
            <Label htmlFor="thread-loop-interval" className="text-sm">
              Interval
            </Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {THREAD_LOOP_INTERVAL_PRESETS.map((presetMinutes) => {
                const selected = intervalMinutes === String(presetMinutes);
                return (
                  <button
                    key={presetMinutes}
                    type="button"
                    onClick={() => setIntervalMinutes(String(presetMinutes))}
                    className={[
                      "inline-flex h-7 items-center rounded-md border px-2.5 font-mono text-xs transition-colors duration-100 sm:h-6 sm:text-[0.6875rem]",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      selected
                        ? "border-primary/30 bg-primary/10 text-primary font-medium dark:border-primary/20 dark:bg-primary/16"
                        : "border-input bg-background text-muted-foreground hover:bg-accent/50 dark:bg-input/32 dark:hover:bg-input/48",
                    ].join(" ")}
                  >
                    {formatInterval(presetMinutes)}
                  </button>
                );
              })}
              <div className="flex items-center gap-1.5">
                <Input
                  id="thread-loop-interval"
                  type="number"
                  min={1}
                  step={1}
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                  className="h-7 w-16 font-mono text-xs sm:h-6 sm:text-[0.6875rem]"
                />
                <span className="text-muted-foreground text-xs">min</span>
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="thread-loop-prompt" className="text-sm">
              Prompt
            </Label>
            <Textarea
              id="thread-loop-prompt"
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Check the deployment status and summarize any issues."
              className="text-sm leading-relaxed"
            />
          </div>

          {/* Run history */}
          {props.loop ? (
            <div className="space-y-2">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                History
              </span>
              <div className="rounded-lg border border-border/60 bg-muted/10 text-sm divide-y divide-border/40">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground text-xs">Next run</span>
                  <span className="text-xs tabular-nums">
                    {formatTimestamp(props.loop.nextRunAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-muted-foreground text-xs">Last run</span>
                  <span className="text-xs tabular-nums">
                    {formatTimestamp(props.loop.lastRunAt)}
                  </span>
                </div>
              </div>
              {props.loop.lastError ? (
                <div className="rounded-lg border border-warning/20 bg-warning/6 px-3.5 py-2.5 dark:border-warning/14 dark:bg-warning/10">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                    <AlertCircleIcon className="size-3.5 shrink-0" />
                    Last run error
                  </div>
                  <p className="mt-1 text-xs text-warning-foreground/80 leading-relaxed">
                    {props.loop.lastError}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/6 px-3.5 py-2.5 text-destructive-foreground text-sm dark:border-destructive/14 dark:bg-destructive/10">
              {error}
            </div>
          ) : null}
        </SheetPanel>
        <SheetFooter className="items-stretch sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {props.loop ? (
              <Button
                type="button"
                variant="destructive-outline"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={isDeleting || isSaving || isRunningNow}
              >
                <Trash2Icon className="size-3.5" />
                {isDeleting ? "Deleting\u2026" : "Delete"}
              </Button>
            ) : null}
            {props.loop ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRunNow()}
                disabled={isDeleting || isSaving || isRunningNow}
              >
                <RefreshCwIcon className="size-3.5" />
                {isRunningNow ? "Running\u2026" : "Run now"}
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? "Saving\u2026" : props.loop ? "Update" : "Create loop"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
