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

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent } from "../../components/ui/collapsible";
import { Label } from "../../components/ui/label";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../../components/ui/number-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
  SheetTrigger,
} from "../../components/ui/sheet";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { ThreadLoop } from "~/types";

const THREAD_LOOP_INTERVAL_PRESETS = [1, 5, 15, 30, 60, 240] as const;
const THREAD_LOOP_COMPACT_EVERY_PRESETS = [1, 2, 3, 4] as const;
const THREAD_LOOP_COMPACT_THRESHOLD_PRESETS = [50, 60, 70, 80] as const;
const THREAD_LOOP_COMPACT_THRESHOLD_MIN = 50;
const THREAD_LOOP_COMPACT_THRESHOLD_MAX = 80;
type EditableCompactTiming = "disabled" | "before";

function normalizeCompactTiming(
  timing: "disabled" | "before" | "after" | undefined,
): EditableCompactTiming {
  return timing === undefined || timing === "disabled" ? "disabled" : "before";
}

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

const presetChipClassName = (selected: boolean) =>
  cn(
    "inline-flex h-7 min-w-9 items-center justify-center rounded-full border px-2.5 font-mono text-xs transition-all duration-150 sm:h-6 sm:min-w-8 sm:text-[0.6875rem]",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    selected
      ? "border-primary/40 bg-primary/12 font-medium text-primary shadow-[inset_0_0_0_1px] shadow-primary/16 dark:border-primary/24 dark:bg-primary/18"
      : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
  );

function isLoopToggleSwitchTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-slot="switch"]') !== null;
}

function LoopToggleCard({
  id,
  checked,
  onCheckedChange,
  className,
  children,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const toggle = () => onCheckedChange(!checked);

  return (
    <div
      id={`${id}-label`}
      role="button"
      tabIndex={0}
      aria-pressed={checked}
      className={cn("flex cursor-pointer items-center justify-between gap-3", className)}
      onClick={(event) => {
        if (isLoopToggleSwitchTarget(event.target)) return;
        toggle();
      }}
      onKeyDown={(event) => {
        if (isLoopToggleSwitchTarget(event.target)) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <div className="min-w-0">{children}</div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function LoopSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/55 bg-card/40 shadow-xs/5",
        className,
      )}
    >
      <div className="space-y-0.5 border-b border-border/45 bg-muted/24 px-3.5 py-2.5">
        <h3 className="text-sm font-medium leading-none tracking-tight">{title}</h3>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3 px-3.5 py-3">{children}</div>
    </section>
  );
}

function PresetChipRow<T extends string | number>({
  presets,
  value,
  onSelect,
  format = String,
  ariaLabel,
}: {
  presets: readonly T[];
  value: T;
  onSelect: (value: T) => void;
  format?: (value: T) => string;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={ariaLabel}>
      {presets.map((preset) => {
        const selected = value === preset;
        return (
          <button
            key={String(preset)}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(preset)}
            className={presetChipClassName(selected)}
          >
            {format(preset)}
          </button>
        );
      })}
    </div>
  );
}

function LoopNumberControl({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  presets,
  formatPreset = String,
  presetAriaLabel,
}: {
  id: string;
  label?: string;
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step?: number;
  suffix?: string;
  presets?: readonly number[];
  formatPreset?: (value: number) => string;
  presetAriaLabel?: string;
}) {
  const resolvedAriaLabel = ariaLabel ?? label ?? "Value";

  return (
    <div className="space-y-2">
      {label ? (
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
      ) : null}
      <div className="flex items-center gap-2">
        <NumberField
          id={id}
          className="w-auto gap-0"
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={(next) => {
            if (next !== null && Number.isFinite(next)) {
              onChange(next);
            }
          }}
          size="sm"
        >
          <NumberFieldGroup className="h-7 w-[7.25rem] rounded-lg sm:h-6.5">
            <NumberFieldDecrement
              aria-label={`Decrease ${resolvedAriaLabel.toLowerCase()}`}
              className="px-2 sm:px-2 [&_svg]:size-3.5"
            />
            <NumberFieldInput
              aria-label={resolvedAriaLabel}
              className="h-7 w-10 grow-0 px-0 font-mono text-xs leading-7 sm:h-6.5 sm:leading-6.5"
              inputMode="numeric"
            />
            <NumberFieldIncrement
              aria-label={`Increase ${resolvedAriaLabel.toLowerCase()}`}
              className="px-2 sm:px-2 [&_svg]:size-3.5"
            />
          </NumberFieldGroup>
        </NumberField>
        {suffix ? <span className="text-muted-foreground text-xs">{suffix}</span> : null}
      </div>
      {presets && presetAriaLabel ? (
        <PresetChipRow
          presets={presets}
          value={value}
          onSelect={onChange}
          format={formatPreset}
          ariaLabel={presetAriaLabel}
        />
      ) : null}
    </div>
  );
}

function LoopHistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2 first:pt-0 last:pb-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right font-mono text-[0.6875rem] leading-snug text-foreground/90 tabular-nums">
        {value}
      </span>
    </div>
  );
}

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
      compactTiming: "disabled" | "before" | "after";
      compactEveryRuns: number;
      compactContextUsageThresholdPercent: number;
    },
  ) => Promise<void>;
  onDeleteLoop: (threadId: ThreadId) => Promise<void>;
  onRunNow: (threadId: ThreadId) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(props.loop?.enabled ?? true);
  const [prompt, setPrompt] = useState(props.loop?.prompt ?? "");
  const [intervalMinutes, setIntervalMinutes] = useState(props.loop?.intervalMinutes ?? 30);
  const [compactTiming, setCompactTiming] = useState<EditableCompactTiming>(
    normalizeCompactTiming(props.loop?.compactTiming),
  );
  const [compactEveryRuns, setCompactEveryRuns] = useState(props.loop?.compactEveryRuns ?? 1);
  const [compactContextUsageThresholdPercent, setCompactContextUsageThresholdPercent] = useState(
    props.loop?.compactContextUsageThresholdPercent ?? THREAD_LOOP_COMPACT_THRESHOLD_MIN,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEnabled(props.loop?.enabled ?? true);
    setPrompt(props.loop?.prompt ?? "");
    setIntervalMinutes(props.loop?.intervalMinutes ?? 30);
    setCompactTiming(normalizeCompactTiming(props.loop?.compactTiming));
    setCompactEveryRuns(props.loop?.compactEveryRuns ?? 1);
    setCompactContextUsageThresholdPercent(
      props.loop?.compactContextUsageThresholdPercent ?? THREAD_LOOP_COMPACT_THRESHOLD_MIN,
    );
    setError(null);
  }, [open, props.loop]);

  const status = useMemo(() => deriveStatus(props.loop), [props.loop]);
  const compactEnabled = compactTiming !== "disabled";

  const tooltipText = useMemo(() => {
    if (!props.loop) return "Configure a recurring loop";
    const lines = [
      props.loop.enabled ? "Loop active" : "Loop paused",
      `Every ${formatInterval(props.loop.intervalMinutes)}`,
    ];
    if (props.loop.nextRunAt) lines.push(`Next: ${formatRelativeTime(props.loop.nextRunAt)}`);
    if ((props.loop.compactTiming ?? "disabled") !== "disabled") {
      const every = props.loop.compactEveryRuns ?? 1;
      const threshold =
        props.loop.compactContextUsageThresholdPercent ?? THREAD_LOOP_COMPACT_THRESHOLD_MIN;
      lines.push(
        `Compact: before every ${every} ${every === 1 ? "run" : "runs"} at ${threshold}% context`,
      );
    }
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
          compactTiming: normalizeCompactTiming(props.loop.compactTiming),
          compactEveryRuns: props.loop.compactEveryRuns ?? 1,
          compactContextUsageThresholdPercent:
            props.loop.compactContextUsageThresholdPercent ?? THREAD_LOOP_COMPACT_THRESHOLD_MIN,
        });
      } finally {
        setIsTogglingPause(false);
      }
    },
    [props, isTogglingPause],
  );

  const handleSave = async () => {
    const trimmedPrompt = prompt.trim();

    if (trimmedPrompt.length === 0) {
      setError("Prompt is required.");
      return;
    }
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
      setError("Interval must be at least 1 minute.");
      return;
    }
    if (
      compactTiming !== "disabled" &&
      (!Number.isInteger(compactEveryRuns) || compactEveryRuns < 1)
    ) {
      setError("Compaction counter must be at least 1 run.");
      return;
    }
    if (
      compactTiming !== "disabled" &&
      (!Number.isInteger(compactContextUsageThresholdPercent) ||
        compactContextUsageThresholdPercent < THREAD_LOOP_COMPACT_THRESHOLD_MIN ||
        compactContextUsageThresholdPercent > THREAD_LOOP_COMPACT_THRESHOLD_MAX)
    ) {
      setError("Compaction threshold must be between 50% and 80%.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await props.onUpsertLoop(props.threadId, {
        enabled,
        prompt: trimmedPrompt,
        intervalMinutes,
        compactTiming,
        compactEveryRuns:
          compactTiming === "disabled" ? Math.max(1, compactEveryRuns || 1) : compactEveryRuns,
        compactContextUsageThresholdPercent:
          compactTiming === "disabled"
            ? THREAD_LOOP_COMPACT_THRESHOLD_MIN
            : compactContextUsageThresholdPercent,
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
      {status === "unconfigured" ? (
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
              type="button"
              title={tooltipText}
            />
          }
        >
          <RepeatIcon className="size-4" />
          <span className={props.compact ? "sr-only" : "sr-only sm:not-sr-only"}>Loop</span>
        </SheetTrigger>
      ) : (
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
                        "h-8 rounded-lg px-2 text-xs sm:h-7 sm:text-[0.6875rem]",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        "rounded-r-none border-r-0",
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

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={isTogglingPause}
                  onClick={(event) => void handleQuickTogglePause(event)}
                  className={[
                    "inline-flex shrink-0 cursor-pointer items-center justify-center border border-l-0 outline-none transition-colors duration-150",
                    "h-8 w-8 rounded-lg rounded-l-none sm:h-7 sm:w-7",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    "disabled:pointer-events-none disabled:opacity-50",
                    statusChipClasses[status],
                  ].join(" ")}
                />
              }
            >
              {props.loop?.enabled ? (
                <PauseIcon className="size-3 fill-current" />
              ) : (
                <PlayIcon className="size-3 fill-current" />
              )}
            </TooltipTrigger>
            <TooltipPopup>{props.loop?.enabled ? "Pause loop" : "Resume loop"}</TooltipPopup>
          </Tooltip>
        </div>
      )}

      <SheetContent side="right" className="max-w-md">
        <SheetHeader className="gap-3 pe-8">
          <SheetTitle>Thread loop</SheetTitle>
          <SheetDescription className="text-pretty leading-relaxed">
            Configure a recurring prompt that runs automatically on a schedule. The server skips
            ticks while the thread is busy.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-3.5">
          <LoopToggleCard
            id="thread-loop-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            className="rounded-xl border border-border/55 bg-muted/16 px-3.5 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              {props.loop ? <StatusDot status={status} /> : null}
              <span className="text-sm font-medium">
                {props.loop
                  ? status === "active"
                    ? "Loop running"
                    : status === "paused"
                      ? "Loop paused"
                      : status === "error"
                        ? "Loop error"
                        : "Loop off"
                  : "Enable loop"}
              </span>
              {props.loop?.nextRunAt && status === "active" ? (
                <Badge variant="outline" size="sm" className="font-normal">
                  Next {formatRelativeTime(props.loop.nextRunAt)}
                </Badge>
              ) : null}
            </div>
          </LoopToggleCard>

          <LoopSection title="Interval">
            <LoopNumberControl
              id="thread-loop-interval"
              ariaLabel="Interval in minutes"
              value={intervalMinutes}
              onChange={setIntervalMinutes}
              min={1}
              suffix="min"
              presets={THREAD_LOOP_INTERVAL_PRESETS}
              formatPreset={formatInterval}
              presetAriaLabel="Interval presets"
            />
          </LoopSection>

          <LoopSection title="Prompt" description="What the agent should do on each scheduled run.">
            <Textarea
              id="thread-loop-prompt"
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Check the deployment status and summarize any issues."
              className="min-h-[7.5rem] resize-y border-border/60 bg-background/70 text-sm leading-relaxed"
            />
          </LoopSection>

          <section className="overflow-hidden rounded-xl border border-border/55 bg-card/40 shadow-xs/5">
            <LoopToggleCard
              id="thread-loop-compact-enabled"
              checked={compactEnabled}
              onCheckedChange={(checked) => setCompactTiming(checked ? "before" : "disabled")}
              className="px-3.5 py-2.5"
            >
              <div className="space-y-0.5">
                <span className="text-sm font-medium">Context compaction</span>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Runs before the scheduled loop when the counter is reached.
                </p>
              </div>
            </LoopToggleCard>

            <Collapsible open={compactEnabled}>
              <CollapsibleContent className="transition-[height,opacity] duration-300 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-open:opacity-100 motion-reduce:transition-none">
                <div className="space-y-3 border-t border-border/45 px-3.5 py-3">
                  <LoopNumberControl
                    id="thread-loop-compact-every"
                    label="Compact every"
                    ariaLabel="Compact every runs"
                    value={compactEveryRuns}
                    onChange={setCompactEveryRuns}
                    min={1}
                    suffix="runs"
                    presets={THREAD_LOOP_COMPACT_EVERY_PRESETS}
                    presetAriaLabel="Compaction frequency presets"
                  />
                  <LoopNumberControl
                    id="thread-loop-compact-threshold"
                    label="Context threshold"
                    ariaLabel="Context threshold percent"
                    value={compactContextUsageThresholdPercent}
                    onChange={setCompactContextUsageThresholdPercent}
                    min={THREAD_LOOP_COMPACT_THRESHOLD_MIN}
                    max={THREAD_LOOP_COMPACT_THRESHOLD_MAX}
                    step={5}
                    suffix="%"
                    presets={THREAD_LOOP_COMPACT_THRESHOLD_PRESETS}
                    formatPreset={(preset) => `${preset}%`}
                    presetAriaLabel="Context threshold presets"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

          {props.loop ? (
            <LoopSection title="Run history">
              <div className="divide-y divide-border/40">
                <LoopHistoryRow label="Next run" value={formatTimestamp(props.loop.nextRunAt)} />
                <LoopHistoryRow label="Last run" value={formatTimestamp(props.loop.lastRunAt)} />
                {(props.loop.compactTiming ?? "disabled") !== "disabled" ? (
                  <LoopHistoryRow
                    label="Compaction count"
                    value={`${props.loop.runsSinceCompaction ?? 0}/${props.loop.compactEveryRuns ?? 1}`}
                  />
                ) : null}
                {(props.loop.compactTiming ?? "disabled") !== "disabled" ? (
                  <LoopHistoryRow
                    label="Context threshold"
                    value={`${props.loop.compactContextUsageThresholdPercent ?? THREAD_LOOP_COMPACT_THRESHOLD_MIN}%`}
                  />
                ) : null}
              </div>
              {props.loop.lastError ? (
                <div className="rounded-lg border border-warning/22 bg-warning/6 px-3 py-2.5 dark:border-warning/14 dark:bg-warning/10">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                    <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden />
                    Last run error
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-warning-foreground/85">
                    {props.loop.lastError}
                  </p>
                </div>
              ) : null}
            </LoopSection>
          ) : null}

          {error ? (
            <div
              className="rounded-xl border border-destructive/22 bg-destructive/6 px-3.5 py-2.5 text-sm text-destructive-foreground dark:border-destructive/14 dark:bg-destructive/10"
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </SheetPanel>
        <SheetFooter className="gap-3 sm:items-center sm:justify-between">
          {props.loop ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="destructive-outline"
                size="sm"
                className="sm:order-1"
                onClick={() => void handleDelete()}
                disabled={isDeleting || isSaving || isRunningNow}
              >
                <Trash2Icon className="size-3.5" />
                {isDeleting ? "Deleting\u2026" : "Delete"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="sm:order-2"
                onClick={() => void handleRunNow()}
                disabled={isDeleting || isSaving || isRunningNow}
              >
                <RefreshCwIcon className="size-3.5" />
                {isRunningNow ? "Running\u2026" : "Run now"}
              </Button>
            </div>
          ) : (
            <span className="hidden sm:block sm:flex-1" />
          )}
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => void handleSave()}
            disabled={isSaving || isDeleting || isRunningNow}
          >
            {isSaving ? "Saving\u2026" : props.loop ? "Save changes" : "Create loop"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
