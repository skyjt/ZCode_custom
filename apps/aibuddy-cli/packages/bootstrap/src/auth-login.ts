import type {
  createCodingPlanApiKeyResolver,
  createCliOAuthClient,
  BrowserOpenResult,
  SharedAIbuddyCredentialStore,
  CliOAuthInitData,
  CliOAuthPollData,
  CliOAuthUser,
} from "@aibuddy/adapters";
import { createSharedAIbuddyCredentialStore } from "@aibuddy/adapters";
import type { EnvRecord } from "@aibuddy/adapters/model";

export type CodingPlanProviderId = "bigmodel" | "zai";

export interface LoginAIbuddyCliOptions {
  providerId?: CodingPlanProviderId;
  abortSignal?: AbortSignal;
  apiKeyResolver?: ReturnType<typeof createCodingPlanApiKeyResolver>;
  baseUrl?: string;
  credentialStore?: SharedAIbuddyCredentialStore;
  env?: EnvRecord;
  httpClient?: Parameters<typeof createCliOAuthClient>[0]["httpClient"];
  noBrowser?: boolean;
  now?: () => number;
  onAuthorizeUrl?: (data: CliOAuthInitData) => void | Promise<void>;
  onBrowserOpen?: (result: BrowserOpenResult) => void | Promise<void>;
  onPollStatus?: (data: CliOAuthPollData) => void | Promise<void>;
  openBrowser?: (url: string) => Promise<BrowserOpenResult>;
  pollToken?: string;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  personalProviderConfigPath?: string;
}

export interface LoginAIbuddyCliResult {
  browser?: BrowserOpenResult;
  configPath: string;
  credentialsPath: string;
  model: string;
  providerId: CodingPlanProviderId;
  user: CliOAuthUser;
}

export type LoginBigmodelCodingPlanOptions = Omit<LoginAIbuddyCliOptions, "providerId">;
export type LoginBigmodelCodingPlanResult = LoginAIbuddyCliResult & { providerId: "bigmodel" };

export interface ConfigureCodingPlanApiKeyOptions {
  apiKey: string;
  credentialStore?: SharedAIbuddyCredentialStore;
  env?: EnvRecord;
  personalProviderConfigPath?: string;
  providerId: CodingPlanProviderId;
}

export interface ConfigureCodingPlanApiKeyResult {
  configPath: string;
  model: string;
  providerId: CodingPlanProviderId;
}

export interface LogoutAIbuddyCliOptions {
  credentialStore?: SharedAIbuddyCredentialStore;
  env?: EnvRecord;
}

export interface LogoutAIbuddyCliResult {
  credentialsPath: string;
}

export class AIbuddyCliLoginError extends Error {
  readonly code = "auth_failed";
  constructor() {
    super(
      "Product login has been removed. Configure an API provider in AIbuddy Settings or Personal Provider Config.",
    );
    this.name = "AIbuddyCliLoginError";
  }
}
export async function hasConfiguredStandaloneCodingPlan(
  _options: { credentialStore?: SharedAIbuddyCredentialStore; env?: EnvRecord } = {},
): Promise<boolean> {
  return false;
}
export async function loginAIbuddyCli(
  _options: LoginAIbuddyCliOptions = {},
): Promise<LoginAIbuddyCliResult> {
  throw new AIbuddyCliLoginError();
}
export async function loginBigmodelCodingPlan(
  _options: LoginBigmodelCodingPlanOptions = {},
): Promise<LoginBigmodelCodingPlanResult> {
  throw new AIbuddyCliLoginError();
}
export async function configureCodingPlanApiKey(
  _options: ConfigureCodingPlanApiKeyOptions,
): Promise<ConfigureCodingPlanApiKeyResult> {
  throw new AIbuddyCliLoginError();
}
export async function logoutAIbuddyCli(
  options: LogoutAIbuddyCliOptions = {},
): Promise<LogoutAIbuddyCliResult> {
  return {
    credentialsPath: (
      options.credentialStore ?? createSharedAIbuddyCredentialStore({ env: options.env })
    ).filePath,
  };
}
