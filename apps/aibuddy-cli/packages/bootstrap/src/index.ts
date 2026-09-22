// Bootstrap public API surface.

export * from "./app/create-app.js";
export type {
  ListAIbuddySessionsOptions,
  PromptInput,
  ResolveLatestSessionOptions,
  ResumeOptions,
  RunAIbuddyProtocolAgentOptions,
  SendInputOptions,
  SendInputResult,
  SetLocaleResult,
  SteerTurnOptions,
  SubmitPromptOptions,
  UserPromptInput,
  AIbuddyApp,
  AIbuddyAppOptions,
  AIbuddyModelOption,
} from "./app/types.js";
export * from "./auth-login.js";
export {
  inspectAIbuddyCustomCommand,
  listAIbuddyCustomCommands,
  loadAIbuddyCustomCommand,
} from "./custom-commands.js";
export type {
  InspectAIbuddyCustomCommandOptions,
  ListAIbuddyCustomCommandsOptions,
  AIbuddyCustomCommandInspection,
} from "./custom-commands.js";
export { createModelAdapter } from "./model-factory.js";
export type { CreateModelAdapterOptions } from "./model-factory.js";
export { startProcessProviderRegistryRuntime } from "./app/process-provider-registry-runtime.js";
export type { ProcessProviderRegistryRuntimeOptions } from "./app/process-provider-registry-runtime.js";
export {
  addAIbuddyPluginMarketplace,
  getAIbuddyPluginsOverview,
  installAIbuddyMarketplacePlugin,
  listAIbuddyPlugins,
  removeAIbuddyPluginMarketplace,
  resolveAIbuddyPlugins,
  setAIbuddyPluginEnabled,
  uninstallAIbuddyMarketplacePlugin,
  updateAIbuddyMarketplacePlugin,
  updateAIbuddyPluginMarketplace,
  validateAIbuddyPluginPath,
} from "./plugins.js";
export type {
  AddAIbuddyMarketplaceOptions,
  InstallAIbuddyMarketplacePluginOptions,
  ListAIbuddyPluginsOptions,
  RemoveAIbuddyMarketplaceOptions,
  ResolveAIbuddyPluginsOptions,
  SetAIbuddyPluginEnabledOptions,
  SetAIbuddyPluginEnabledResult,
  UninstallAIbuddyMarketplacePluginOptions,
  UpdateAIbuddyMarketplaceOptions,
  UpdateAIbuddyMarketplacePluginOptions,
  ValidateAIbuddyPluginPathOptions,
  AIbuddyAvailablePluginData,
  AIbuddyInstalledPluginData,
  AIbuddyMarketplaceSummaryData,
  AIbuddyMarketplaceUpdateData,
  AIbuddyPluginInstallData,
  AIbuddyPluginUpdateData,
  AIbuddyPluginsOverviewData,
} from "./plugins.js";
export { runAIbuddyProtocolAgent } from "./aibuddy-protocol-entrypoint.js";
// Exposed for the CLI's --output-format stream-json: it needs the same event
// shape the protocol server emits, rather than inventing a second one.
export { mapSessionEvent } from "./aibuddy-protocol/session-mapper.js";
export { prepareAIbuddyTelemetryEnv, shutdownAIbuddyTelemetry } from "./telemetry-bootstrap.js";
export type { SessionTranscriptMessage, SessionTranscriptPart } from "./session-transcript.js";
export { listAIbuddySessions, resolveLatestSession } from "./sessions.js";
export { inspectAIbuddySkill, listAIbuddySkills } from "./skills.js";
export type {
  InspectAIbuddySkillOptions,
  ListAIbuddySkillsOptions,
  AIbuddySkillInspection,
} from "./skills.js";
// Exposed for the CLI's headless slash routing: it must decide "is this a real
// custom command?" with the *same* reserved-name gate the app facade's
// customCommandPromptResolver applies, or the two disagree and a reserved name
// reaches the model as literal prompt text. See prompt-command.ts.
export { isReservedAIbuddySlashCommandName } from "./slash-command-surface.js";
export {
  grantWorkspaceHookTrust,
  inspectWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
} from "./workspace-hook-trust-cli.js";
export type {
  WorkspaceHookTrustCliItem,
  WorkspaceHookTrustCliStatus,
  WorkspaceHookTrustCliTarget,
} from "./workspace-hook-trust-cli.js";
