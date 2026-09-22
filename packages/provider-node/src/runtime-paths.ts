export const AIBUDDY_BUILTIN_PROVIDER_CONFIG_FILE_ENV = "AIBUDDY_BUILTIN_PROVIDER_CONFIG_FILE";
export const AIBUDDY_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV =
  "AIBUDDY_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE";
export const AIBUDDY_PERSONAL_PROVIDER_CONFIG_FILE_ENV = "AIBUDDY_PERSONAL_PROVIDER_CONFIG_FILE";
export const PERSONAL_PROVIDER_CONFIG_FILE_NAME = "provider_config.json";

export interface NodeProviderRuntimePaths {
  readonly aibuddyBuiltinFilePath: string;
  readonly personalFilePath: string;
}

export function createNodeProviderRuntimePathEnv(
  paths: NodeProviderRuntimePaths,
): Record<string, string> {
  return {
    [AIBUDDY_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: paths.aibuddyBuiltinFilePath,
    [AIBUDDY_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: paths.personalFilePath,
  };
}

export function resolveNodeProviderRuntimePaths(
  env: Readonly<Record<string, string | undefined>>,
): NodeProviderRuntimePaths | null {
  const aibuddyBuiltinFilePath = env[AIBUDDY_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const personalFilePath = env[AIBUDDY_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim();
  if (!aibuddyBuiltinFilePath && !personalFilePath) return null;
  if (!aibuddyBuiltinFilePath || !personalFilePath) {
    throw new Error("AIbuddy Built-in 与 Personal Provider Config 路径必须同时提供");
  }
  return Object.freeze({ aibuddyBuiltinFilePath, personalFilePath });
}
