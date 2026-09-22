import { getAIbuddyCopy, type SupportedLocale, type UiLocale } from "@aibuddy/i18n";

export function formatCliHelp(
  version: string,
  locale?: UiLocale,
  detectedLocale?: SupportedLocale,
): string {
  return getAIbuddyCopy(locale, detectedLocale).cli.help(version);
}
