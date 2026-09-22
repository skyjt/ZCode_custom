import type { TuiReadClipboardImage, TuiWriteClipboardText } from "@aibuddy/tui";
import type { UiLocale } from "@aibuddy/i18n";
import type { Logger } from "@aibuddy/contracts";
import type {
  createManagedCdpBrowserRuntime,
  ManagedCdpBrowserRuntimeOptions,
} from "@aibuddy/adapters/browser";
import type {
  createModelAdapter,
  createAIbuddyApp,
  CreateModelAdapterOptions,
  configureCodingPlanApiKey,
  ConfigureCodingPlanApiKeyOptions,
  inspectAIbuddySkill,
  inspectWorkspaceHookTrust,
  grantWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
  inspectAIbuddyCustomCommand,
  InspectAIbuddyCustomCommandOptions,
  InspectAIbuddySkillOptions,
  loginAIbuddyCli,
  loginBigmodelCodingPlan,
  LoginBigmodelCodingPlanOptions,
  LoginAIbuddyCliOptions,
  listAIbuddyCustomCommands,
  ListAIbuddyCustomCommandsOptions,
  loadAIbuddyCustomCommand,
  listAIbuddySessions,
  listAIbuddySkills,
  ListAIbuddySessionsOptions,
  ListAIbuddySkillsOptions,
  logoutAIbuddyCli,
  LogoutAIbuddyCliOptions,
  resolveLatestSession,
  ResolveLatestSessionOptions,
  RunAIbuddyProtocolAgentOptions,
  prepareAIbuddyTelemetryEnv,
  startProcessProviderRegistryRuntime,
  shutdownAIbuddyTelemetry,
  AIbuddyAppOptions,
} from "@aibuddy/bootstrap";
import type { CliEnv, DotenvLoadResult, LoadCliDotenvOptions } from "./env.js";
import type { PluginsCommandOverrides } from "./plugins-command.js";
import type { CliShutdownProcess } from "./shutdown.js";
import type { resolveWorkspaceGitBranch } from "./tui-workspace-git.js";

export type BootstrapModule = typeof import("@aibuddy/bootstrap");

export interface RunDependencies extends PluginsCommandOverrides {
  protocolLifecycle?: RunAIbuddyProtocolAgentOptions["lifecycle"];
  protocolInput?: NodeJS.ReadableStream;
  createManagedCdpBrowserRuntime?: (
    options?: ManagedCdpBrowserRuntimeOptions,
  ) => ReturnType<typeof createManagedCdpBrowserRuntime>;
  createModelAdapter?: (
    options?: CreateModelAdapterOptions,
  ) => ReturnType<typeof createModelAdapter>;
  createAIbuddyApp?: (
    options?: AIbuddyAppOptions,
  ) => Awaited<ReturnType<typeof createAIbuddyApp>> | ReturnType<typeof createAIbuddyApp>;
  /**
   * Session-event shaper for --output-format stream-json. Defaults to the
   * bootstrap module's, which is also what the protocol server uses; injectable
   * so a caller that supplies its own `createAIbuddyApp` (tests, embedders) can
   * still stream, since the bootstrap module is not loaded on that path.
   */
  mapSessionEvent?: BootstrapModule["mapSessionEvent"];
  cwd?: () => string;
  env?: CliEnv;
  inspectSkill?: (options: InspectAIbuddySkillOptions) => ReturnType<typeof inspectAIbuddySkill>;
  inspectWorkspaceHookTrust?: typeof inspectWorkspaceHookTrust;
  grantWorkspaceHookTrust?: typeof grantWorkspaceHookTrust;
  revokeWorkspaceHookTrustCli?: typeof revokeWorkspaceHookTrustCli;
  inspectCustomCommand?: (
    options: InspectAIbuddyCustomCommandOptions,
  ) => ReturnType<typeof inspectAIbuddyCustomCommand>;
  loginAIbuddyCli?: (options?: LoginAIbuddyCliOptions) => ReturnType<typeof loginAIbuddyCli>;
  loginBigmodelCodingPlan?: (
    options?: LoginBigmodelCodingPlanOptions,
  ) => ReturnType<typeof loginBigmodelCodingPlan>;
  configureCodingPlanApiKey?: (
    options: ConfigureCodingPlanApiKeyOptions,
  ) => ReturnType<typeof configureCodingPlanApiKey>;
  loadDotenv?: (options?: LoadCliDotenvOptions) => DotenvLoadResult;
  prepareAIbuddyTelemetryEnv?: typeof prepareAIbuddyTelemetryEnv;
  projectConfigPath?: string;
  listSessions?: (options: ListAIbuddySessionsOptions) => ReturnType<typeof listAIbuddySessions>;
  listCustomCommands?: (
    options: ListAIbuddyCustomCommandsOptions,
  ) => ReturnType<typeof listAIbuddyCustomCommands>;
  loadCustomCommand?: (
    options: InspectAIbuddyCustomCommandOptions,
  ) => ReturnType<typeof loadAIbuddyCustomCommand>;
  // headless slash 路由要和 app facade 的保留名 gate 用同一个判据；默认取 bootstrap 的，
  // 注入点只为让单测不必拉起整个 bootstrap 模块。见 prompt-command.ts。
  isReservedSlashCommandName?: BootstrapModule["isReservedAIbuddySlashCommandName"];
  listSkills?: (options: ListAIbuddySkillsOptions) => ReturnType<typeof listAIbuddySkills>;
  logger?: Logger;
  readClipboardImage?: TuiReadClipboardImage;
  writeClipboardText?: TuiWriteClipboardText;
  resolveLatestSession?: (
    options: ResolveLatestSessionOptions,
  ) => ReturnType<typeof resolveLatestSession>;
  resolveWorkspaceGitBranch?: typeof resolveWorkspaceGitBranch;
  logoutAIbuddyCli?: (options?: LogoutAIbuddyCliOptions) => ReturnType<typeof logoutAIbuddyCli>;
  runAIbuddyProtocolAgent?: (options?: RunAIbuddyProtocolAgentOptions) => Promise<void>;
  runTui?: typeof import("@aibuddy/tui").runTui;
  skipUserConfig?: boolean;
  userConfigPath?: string;
  exitProcess?: (code: number) => void;
  shutdownCleanupTimeoutMs?: number;
  shutdownProcess?: CliShutdownProcess;
  startProcessProviderRegistryRuntime?: typeof startProcessProviderRegistryRuntime;
  shutdownAIbuddyTelemetry?: typeof shutdownAIbuddyTelemetry;
}

export type CliPermissionMode = "build" | "plan" | "edit" | "yolo";
export type CliRuntimeMode = CliPermissionMode | "auto";

export interface CliModeState {
  current?: CliRuntimeMode;
  override?: CliPermissionMode;
}

export interface CliTargetRequest {
  objective: string;
  replaceExisting: boolean;
}

export type ModeCapableApp = Awaited<ReturnType<typeof createAIbuddyApp>> & {
  getMode?: () => CliRuntimeMode;
  setLocale?: (locale: UiLocale) => Promise<{ locale: "en-US" | "zh-CN" }>;
  setMode?: (mode: CliRuntimeMode) => Promise<{ mode: CliRuntimeMode }>;
};

export interface CliResumeRequest {
  continueSession: boolean;
  resumeSessionId?: string;
}
