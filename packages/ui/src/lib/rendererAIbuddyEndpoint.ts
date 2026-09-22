import {
  buildRuntimeAIbuddyEndpointUrls,
  AIBUDDY_ENV,
  type RuntimeAIbuddyEndpointEnv,
} from "@aibuddy/shared";

interface RendererImportMetaEnv {
  VITE_AIBUDDY_BASE_URL?: string;
  VITE_AIBUDDY_ENDPOINT_ORIGIN?: string;
}

function readRendererImportMetaEnv(): RendererImportMetaEnv {
  return ((import.meta as ImportMeta & { env?: RendererImportMetaEnv }).env ??
    {}) as RendererImportMetaEnv;
}

function createRendererAIbuddyEndpointEnv(
  env: RendererImportMetaEnv = readRendererImportMetaEnv(),
): RuntimeAIbuddyEndpointEnv {
  return {
    AIBUDDY_ENV,
    // UI 侧的 zcode-plan 占位 provider 以前只看 AIBUDDY_ENV，
    // 没有消费 Vite 注入的 base url，导致自定义测试域名时 renderer 和 host/service 可能不一致。
    AIBUDDY_BASE_URL: env.VITE_AIBUDDY_BASE_URL,
    AIBUDDY_ENDPOINT_ORIGIN: env.VITE_AIBUDDY_ENDPOINT_ORIGIN,
  };
}

export const RENDERER_AIBUDDY_ENDPOINT_URLS = buildRuntimeAIbuddyEndpointUrls(
  createRendererAIbuddyEndpointEnv(),
);
