import { createConfig } from "@aibuddy/adapters/config";
import type { RuntimeConfigPatch } from "@aibuddy/contracts";
import { resolveLocale, type SupportedLocale } from "@aibuddy/i18n";
import type { GlobalOptions } from "@aibuddy/shared-types";
import type { RunDependencies } from "./cli-types.js";

type ResolveTuiStartupLocaleInput = {
  deps: RunDependencies;
  options: GlobalOptions;
  workingDirectory: string;
};

const localeCliOverrides = (locale: GlobalOptions["locale"]): RuntimeConfigPatch | undefined =>
  locale
    ? {
        ui: {
          locale,
        },
      }
    : undefined;

export function resolveTuiStartupLocale({
  deps,
  options,
  workingDirectory,
}: ResolveTuiStartupLocaleInput): SupportedLocale {
  const configResult = createConfig({
    cliOverrides: localeCliOverrides(options.locale),
    env: deps.env ?? process.env,
    projectConfigPath: deps.projectConfigPath,
    skipUserConfig: deps.skipUserConfig,
    userConfigPath: deps.userConfigPath,
    workingDirectory,
  });

  // login-required startup renders local TUI panels before AIbuddyApp
  // exists, so the CLI boundary must resolve persisted ui.locale itself.
  return resolveLocale(configResult.config.ui.locale, options.detectedLocale);
}
