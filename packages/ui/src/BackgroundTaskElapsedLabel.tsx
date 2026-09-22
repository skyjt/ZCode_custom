import { useRef } from "react";
import {
  getAIbuddyBackgroundTaskControlItemElapsedMs,
  type AIbuddyBackgroundTaskControlItem,
} from "@aibuddy/shared";
import { cn } from "@/components/lib/utils.js";
import { useAIbuddyIntl } from "@/i18n/IntlProvider.js";

export function formatBackgroundTaskElapsedLabel(
  elapsedMs: number,
  formatMessage: ReturnType<typeof useAIbuddyIntl>["intl"]["formatMessage"],
) {
  const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return formatMessage(
      { id: "chat.longRunning.elapsedMinutesSeconds" },
      { minutes: String(minutes), seconds: String(seconds) },
    );
  }

  return formatMessage(
    { id: "chat.longRunning.elapsedSeconds" },
    { seconds: String(totalSeconds) },
  );
}

function createElapsedBaseline(job: AIbuddyBackgroundTaskControlItem) {
  const mountedAt = Date.now();
  return {
    elapsedMs: getAIbuddyBackgroundTaskControlItemElapsedMs(job, mountedAt),
    key: `${job.jobId}:${job.startedAt ?? "no-start"}:${job.elapsedMs ?? "no-elapsed"}`,
    mountedAt,
  };
}

function elapsedMsForClock(input: {
  baseline: ReturnType<typeof createElapsedBaseline>;
  job: AIbuddyBackgroundTaskControlItem;
  now: number;
}) {
  const elapsedFromJob = getAIbuddyBackgroundTaskControlItemElapsedMs(input.job, input.now);
  const elapsedFromBaseline =
    input.baseline.elapsedMs + Math.max(0, input.now - input.baseline.mountedAt);
  return Math.max(elapsedFromJob, elapsedFromBaseline);
}

export function BackgroundTaskElapsedLabel({
  className,
  job,
  now = Date.now(),
}: {
  className?: string;
  job: AIbuddyBackgroundTaskControlItem;
  now?: number;
}) {
  const { intl } = useAIbuddyIntl();
  const baselineRef = useRef<ReturnType<typeof createElapsedBaseline> | null>(null);
  const baselineKey = `${job.jobId}:${job.startedAt ?? "no-start"}:${job.elapsedMs ?? "no-elapsed"}`;
  if (!baselineRef.current || baselineRef.current.key !== baselineKey) {
    baselineRef.current = createElapsedBaseline(job);
  }
  const baseline = baselineRef.current;

  return (
    <span className={cn("shrink-0 tabular-nums text-foreground-subtle", className)}>
      {formatBackgroundTaskElapsedLabel(
        elapsedMsForClock({
          baseline,
          job,
          now,
        }),
        intl.formatMessage,
      )}
    </span>
  );
}
