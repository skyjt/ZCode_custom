import type { UserInfo } from "@aibuddy/shared";
import type {
  BrowserOAuthCredentialRepo,
  WebOAuthProviderId,
} from "./browserOAuthCredentialRepo.js";
import type { WebZaiOAuthConfig } from "./webZaiOAuthConfig.js";
import type { ZaiWebOAuthProvider } from "./zaiWebOAuthProvider.js";

interface WebAuthServiceRuntime {
  assign(url: string): void;
  createNonce(): string;
  getCurrentHref(): string;
  getCurrentOrigin(): string;
  replace(url: string): void;
}

interface WebAuthServiceDependencies {
  config?: WebZaiOAuthConfig;
  provider?: ZaiWebOAuthProvider;
  repo?: BrowserOAuthCredentialRepo;
  runtime?: WebAuthServiceRuntime;
}

interface WebAuthLoginOptions {
  devReturnTo?: string;
  appReturnTo?: string;
  redirectUri?: string;
  provider?: WebOAuthProviderId;
}

export interface WebAuthCallbackResult {
  userInfo: UserInfo;
  appReturnTo: string | null;
}

// 旧 Web 消费方不能读取历史 token 或打开产品授权页面。
export class WebAuthService {
  constructor(_dependencies: WebAuthServiceDependencies = {}) {}
  startLogin(_options: WebAuthLoginOptions = {}): never {
    throw new Error("Product login has been removed. Configure an API provider instead.");
  }
  async handleCallback(_url: string): Promise<WebAuthCallbackResult | null> {
    return null;
  }
  async restoreCachedSession(): Promise<UserInfo | null> {
    return null;
  }
  restoreCachedSessionState() {
    return { status: "signed-out" as const };
  }
  getAIbuddyJwtToken(): null {
    return null;
  }
  async logout(): Promise<void> {}
}
export function createWebAuthService(): WebAuthService {
  return new WebAuthService();
}
