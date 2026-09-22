import type { ApiClient, OAuthProviderId } from "@aibuddy/shared";
import type { ICredentialService } from "../credential/credential.js";
import type { IOAuthService } from "./oauth.js";

/** 旧 Host 装配仍可传入依赖；API 接入模式不读取账号凭据、不创建网络客户端。 */
export function createOAuthService(
  _credentialService: ICredentialService,
  _options: {
    apiClient?: ApiClient;
    onProviderLogout?: (
      provider: OAuthProviderId,
      accountIdentity?: string | null,
    ) => Promise<void>;
  } = {},
): IOAuthService & {
  logoutIfCurrentCredentialRequest(input: string | URL, headers: Headers): Promise<boolean>;
} {
  const unavailable = async (): Promise<never> => {
    throw new Error("Product login has been removed. Configure an API provider in Settings.");
  };
  // 保留停用响应供旧 RPC 调用方收尾，不能因残留 token 或回调重新启动账号链路。
  return {
    getProviders: async () => [],
    getActiveProvider: async () => null,
    restoreCachedSession: async () => null,
    restoreCachedSessionState: async () => ({ status: "signed-out" }),
    restoreSession: async () => null,
    startOAuth: unavailable,
    startOAuthWithPolling: unavailable,
    refreshToken: unavailable,
    handleCallback: async () => null,
    pollPendingOAuth: async () => null,
    cancelPending: async () => {},
    logout: async () => {},
    logoutAll: async () => {},
    logoutIfCurrentCredentialRequest: async () => false,
  };
}
