import {
  collectVisibleAIbuddyBackgroundTaskControlItems,
  getAIbuddyBackgroundTaskControlItemElapsedMs,
  isActiveAIbuddyBackgroundTaskControlItem,
  parseAIbuddyBackgroundTaskControlItems,
  type AIbuddyBackgroundTaskControlItem,
  type AIbuddyBackgroundTaskControlStatus,
} from "./background-task-controls.js";

export type AIbuddyBackgroundBashJobStatus = AIbuddyBackgroundTaskControlStatus;
export type AIbuddyBackgroundBashJob = AIbuddyBackgroundTaskControlItem & {
  taskKind: "bash";
};

export function parseAIbuddyBackgroundBashJobs(value: unknown): AIbuddyBackgroundBashJob[] {
  return parseAIbuddyBackgroundTaskControlItems(value).filter(isBackgroundBashJob);
}

export function isActiveAIbuddyBackgroundBashJob(job: AIbuddyBackgroundBashJob): boolean {
  return isActiveAIbuddyBackgroundTaskControlItem(job);
}

export function getAIbuddyBackgroundBashJobElapsedMs(
  job: AIbuddyBackgroundBashJob,
  now = Date.now(),
): number {
  return getAIbuddyBackgroundTaskControlItemElapsedMs(job, now);
}

export function collectVisibleAIbuddyBackgroundBashJobs(
  jobs: readonly AIbuddyBackgroundBashJob[],
  now = Date.now(),
  thresholdMs = 30_000,
): Array<AIbuddyBackgroundBashJob & { elapsedMs: number }> {
  return collectVisibleAIbuddyBackgroundTaskControlItems(jobs, now, thresholdMs) as Array<
    AIbuddyBackgroundBashJob & { elapsedMs: number }
  >;
}

function isBackgroundBashJob(job: AIbuddyBackgroundTaskControlItem): job is AIbuddyBackgroundBashJob {
  return job.taskKind === "bash";
}
