import { AIBUDDY_VERSION, type AIbuddyEnv } from "@aibuddy/shared";

declare const __AIBUDDY_CDN_BASE_URL__: string | undefined;

export interface ResolveRemoteCdnOptions {
  env?: AIbuddyEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("CDN URL must use http or https");
  return value.replace(/\/+$/, "");
}

export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const baseUrl =
    process.env.AIBUDDY_CDN_BASE_URL?.trim() ||
    (typeof __AIBUDDY_CDN_BASE_URL__ === "undefined" ? "" : __AIBUDDY_CDN_BASE_URL__);
  // 上游发布包使用旧内部协议；没有 AIbuddy 分发源时仅使用本地随包资源。
  if (!baseUrl) return [];
  return [
    `${normalizeBaseUrl(baseUrl)}/aibuddy/electron/releases/${options.version ?? AIBUDDY_VERSION}`,
  ];
}
