import type { AIbuddyBackgroundTaskControlItem } from "./background-task-controls.js";

export function mergeAIbuddyBackgroundTaskControlItems(
  current: readonly AIbuddyBackgroundTaskControlItem[],
  updates: readonly AIbuddyBackgroundTaskControlItem[],
): AIbuddyBackgroundTaskControlItem[] {
  const jobsById = new Map(current.map((job) => [job.jobId, job] as const));
  for (const job of updates) {
    jobsById.set(job.jobId, job);
  }
  return Array.from(jobsById.values());
}
