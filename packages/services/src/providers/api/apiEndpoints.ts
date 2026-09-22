import { buildRuntimeAIbuddyApiUrl, resolveZaiBusinessBaseUrl } from "@aibuddy/shared";

export const AIBUDDY_CLIENT_SCENES_URL = buildRuntimeAIbuddyApiUrl(
  process.env,
  "/api/v1/client/scenes",
);

export const ZAI_API_HOST = resolveZaiBusinessBaseUrl(process.env);
