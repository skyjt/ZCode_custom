const AIBUDDY_PROCESS_PREFIX = "aibuddy";
const MAX_PROCESS_NAME_SEGMENT_LENGTH = 24;

function sanitizeProcessNameSegment(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_PROCESS_NAME_SEGMENT_LENGTH);
}

function joinAIbuddyProcessName(...segments: Array<string | null | undefined>): string {
  const sanitizedSegments = segments
    .map((segment) => sanitizeProcessNameSegment(segment))
    .filter((segment): segment is string => Boolean(segment));
  return [AIBUDDY_PROCESS_PREFIX, ...sanitizedSegments].join("-");
}

function pickWorkspaceTag(workspacePath: string | null | undefined): string | undefined {
  const trimmedPath = workspacePath?.trim();
  if (!trimmedPath) {
    return undefined;
  }

  const parts = trimmedPath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? trimmedPath;
}

export function formatAIbuddyMainProcessName(): string {
  return joinAIbuddyProcessName("main");
}

export function formatAIbuddyGpuProcessName(): string {
  return joinAIbuddyProcessName("gpu");
}

export function formatAIbuddyHostProcessName(label?: string): string {
  return joinAIbuddyProcessName("host", label);
}

export function formatAIbuddyRendererProcessName(windowTitle?: string): string {
  const normalizedTitle = windowTitle?.trim();
  if (!normalizedTitle || normalizedTitle === "AIbuddy") {
    return joinAIbuddyProcessName("renderer", "main");
  }

  if (normalizedTitle === "Resource Manager") {
    return joinAIbuddyProcessName("renderer", "resource-manager");
  }

  const remoteWindowPrefix = "AIbuddy - ";
  if (normalizedTitle.startsWith(remoteWindowPrefix)) {
    return joinAIbuddyProcessName(
      "renderer",
      "remote",
      normalizedTitle.slice(remoteWindowPrefix.length),
    );
  }

  return joinAIbuddyProcessName("renderer", normalizedTitle);
}

export function formatAIbuddyAgentProcessName(provider: string, workspacePath?: string): string {
  return joinAIbuddyProcessName("agent", provider, pickWorkspaceTag(workspacePath));
}

export function formatAIbuddyUtilityProcessName(name?: string, type = "utility"): string {
  return joinAIbuddyProcessName(type, name);
}
