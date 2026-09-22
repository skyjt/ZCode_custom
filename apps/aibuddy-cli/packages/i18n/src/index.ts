import type { UiLocale, SupportedLocale } from "@aibuddy/contracts";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import {
  DEFAULT_LOCALE,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./locale.js";
import type { AIbuddyCopy } from "./types.js";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
};
export type { LocaleDetectionInput } from "./locale.js";
export type { CliCopy, TuiCopy, UiLocale, SupportedLocale, AIbuddyCopy } from "./types.js";

const CATALOGS: Record<SupportedLocale, AIbuddyCopy> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export function getAIbuddyCopy(locale?: UiLocale | string, detected?: string | null): AIbuddyCopy {
  return CATALOGS[resolveLocale(locale, detected)];
}
