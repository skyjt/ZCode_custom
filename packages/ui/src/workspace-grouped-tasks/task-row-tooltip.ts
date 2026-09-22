import type { AIbuddyTaskChangeSummary } from "@aibuddy/shared";

export function formatGroupedTaskHoverChangeParts(
  summary: AIbuddyTaskChangeSummary | null,
): string[] {
  if (!summary) {
    return [];
  }

  const parts: string[] = [];
  if (summary.added > 0) {
    parts.push(`+${summary.added}`);
  }
  if (summary.removed > 0) {
    parts.push(`-${summary.removed}`);
  }
  return parts;
}
