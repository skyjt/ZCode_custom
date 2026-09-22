import { DEFAULT_AIBUDDY_ENDPOINT_ORIGIN } from "./aibuddyEndpoint.js";

export const AIBUDDY_SOURCE_HEADERS = {
  "User-Agent": "AIbuddy/unknown",
  "HTTP-Referer": DEFAULT_AIBUDDY_ENDPOINT_ORIGIN,
  "X-Title": "AIbuddy@electron",
} as const;

export interface BuildAIbuddySourceHeadersFromContextOptions {
  appVersion?: string;
  arch?: string;
  clientLanguage?: string;
  clientTimezone?: string;
  deviceMid?: string;
  endpointOrigin?: string;
  osVersion?: string;
  platform?: string;
  releaseChannel?: string;
  sourceTitle?: string;
}

export function normalizeAIbuddySourceHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function buildAIbuddySourceHeadersFromContext(
  options: BuildAIbuddySourceHeadersFromContextOptions = {},
): Record<string, string> {
  const appVersion = normalizeAIbuddySourceHeaderValue(options.appVersion);
  const arch = normalizeAIbuddySourceHeaderValue(options.arch);
  const clientLanguage = normalizeAIbuddySourceHeaderValue(options.clientLanguage) ?? "unknown";
  const clientTimezone = normalizeAIbuddySourceHeaderValue(options.clientTimezone) ?? "unknown";
  const deviceMid = normalizeAIbuddySourceHeaderValue(options.deviceMid);
  const endpointOrigin =
    normalizeAIbuddySourceHeaderValue(options.endpointOrigin) ?? DEFAULT_AIBUDDY_ENDPOINT_ORIGIN;
  const osVersion = normalizeAIbuddySourceHeaderValue(options.osVersion);
  const platform = normalizeAIbuddySourceHeaderValue(options.platform);
  const releaseChannel = normalizeAIbuddySourceHeaderValue(options.releaseChannel);
  const sourceTitle = normalizeAIbuddySourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    ...AIBUDDY_SOURCE_HEADERS,
    "HTTP-Referer": endpointOrigin,
    "User-Agent": `AIbuddy/${appVersion ?? "unknown"}`,
    ...(appVersion ? { "X-Z-Code-App-Version": appVersion } : {}),
    "X-Title": `AIbuddy@${sourceTitle}`,
    ...(platform && arch ? { "X-Platform": `${platform}-${arch}` } : {}),
    ...(releaseChannel ? { "X-Release-Channel": releaseChannel } : {}),
    "X-Client-Language": clientLanguage,
    "X-Client-Timezone": clientTimezone,
    ...(platform ? { "X-Os-Category": normalizeOsCategory(platform) } : {}),
    ...(osVersion ? { "X-Os-Version": osVersion } : {}),
    ...(deviceMid ? { "X-Device-Mid": deviceMid } : {}),
  };
}

function normalizeOsCategory(platform: string): string {
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}
