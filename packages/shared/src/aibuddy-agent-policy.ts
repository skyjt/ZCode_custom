import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { AIbuddyProvider } from "./aibuddy-task-types-core.js";

export const AIBUDDY_AGENT_PROVIDER = "glm" satisfies AIbuddyProvider;
export const AIBUDDY_AGENT_PROVIDER_LABEL = "AIbuddy Agent";
export const AIBUDDY_COMMAND_AGENT_SOURCE = "aibuddyAgent" satisfies CommandAgentSource;

export const aibuddyAgentProviderSchema = z.literal(AIBUDDY_AGENT_PROVIDER);

export const AIBUDDY_COMMAND_AGENT_SOURCES = [
  AIBUDDY_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToAIbuddyAgent(
  _provider?: AIbuddyProvider | null,
): AIbuddyProvider {
  return AIBUDDY_AGENT_PROVIDER;
}

export function isAIbuddyAgentProvider(
  provider: AIbuddyProvider | null | undefined,
): provider is typeof AIBUDDY_AGENT_PROVIDER {
  return provider === AIBUDDY_AGENT_PROVIDER;
}
