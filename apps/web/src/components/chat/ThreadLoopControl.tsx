import type { ThreadId } from "@t3tools/contracts";
import {
  AlertCircleIcon,
  Clock3Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import type { ThreadLoop } from "~/types";

function formatThreadLoopInterval(intervalMinutes: number): string {
  if (intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60;
    return hours === 1 ? "1h" : `${hours}h`;
  }
  return `${intervalMinutes} min`;
}

function formatThreadLoopTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function buildThreadLoopTriggerLabel(loop: ThreadLoop | null | undefined): string {
  if (!loop) return "+ Loop";
  if (!loop.enabled) return "Loop pausado";
  if (loop.lastError) return "Loop com erro";
  return `Loop: ${formatThreadLoopInterval(loop.intervalMinutes)}`;
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

  useEffect(() => {
    if (!open) {
      return;
    }
    setEnabled(props.loop?.enabled ?? true);
    setPrompt(props.loop?.prompt ?? "");
    setIntervalMinutes(String(props.loop?.intervalMinutes ?? 30));
    setError(null);
  }, [open, props.loop]);

  const triggerLabel = useMemo(() => buildThreadLoopTriggerLabel(props.loop), [props.loop]);
  const triggerTitle = useMemo(() => {
    if (!props.loop) {
      return "Configure an automatic loop for this thread";
    }
    return [
      triggerLabel,
      `Next run: ${formatThreadLoopTimestamp(props.loop.nextRunAt)}`,
      `Last run: ${formatThreadLoopTimestamp(props.loop.lastRunAt)}`,
    ].join("\n");
  }, [props.loop, triggerLabel]);

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
      setError(nextError instanceof Error ? nextError.message : "Failed to run loop now.");
    } finally {
      setIsRunningNow(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
            size="sm"
            type="button"
            title={triggerTitle}
          />
        }
      >
        {props.loop?.lastError ? (
          <AlertCircleIcon className="size-4 text-amber-500" />
        ) : props.loop?.enabled === false ? (
          <PauseCircleIcon className="size-4" />
        ) : (
          <Clock3Icon className="size-4" />
        )}
        <span className={props.compact ? "sr-only" : "sr-only sm:not-sr-only"}>{triggerLabel}</span>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Thread automation</SheetTitle>
          <SheetDescription>
            Configure a recurring prompt for this thread. The scheduler runs on the server and skips
            ticks while the thread is busy.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="thread-loop-enabled">Loop active</Label>
              <p className="text-muted-foreground text-xs">
                Disable to keep the configuration without scheduling new automatic runs.
              </p>
            </div>
            <Switch id="thread-loop-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thread-loop-interval">Run every</Label>
            <Input
              id="thread-loop-interval"
              type="number"
              min={1}
              step={1}
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">Interval in minutes.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="thread-loop-prompt">Loop prompt</Label>
            <Textarea
              id="thread-loop-prompt"
              rows={8}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Check the deployment and summarize the current status."
            />
          </div>

          {props.loop ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Next run</span>
                <span>{formatThreadLoopTimestamp(props.loop.nextRunAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Last run</span>
                <span>{formatThreadLoopTimestamp(props.loop.lastRunAt)}</span>
              </div>
              {props.loop.lastError ? (
                <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <div className="font-medium text-amber-700 text-xs">Last error</div>
                  <div className="text-xs text-amber-800">{props.loop.lastError}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-destructive text-sm">
              {error}
            </div>
          ) : null}
        </SheetPanel>
        <SheetFooter className="items-stretch sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {props.loop ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDelete()}
                disabled={isDeleting || isSaving || isRunningNow}
              >
                <Trash2Icon className="size-4" />
                {isDeleting ? "Deleting..." : "Delete loop"}
              </Button>
            ) : null}
            {props.loop ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRunNow()}
                disabled={isDeleting || isSaving || isRunningNow}
              >
                <PlayCircleIcon className="size-4" />
                {isRunningNow ? "Running..." : "Run now"}
              </Button>
            ) : null}
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isDeleting}>
            {isSaving ? "Saving..." : "Save loop"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
