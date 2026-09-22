// 平台能力面收敛：设置页「插件管理」的薄服务接口。
//
// 背景：pluginManagementStore / usePluginUninstall 过去直接注入 IAIbuddyAgentService，
// UI 层因此散布 13 个 plugins/* 旧协议词的消费点。收敛为独立薄 service 后，UI 只依赖
// 本接口；plugins/* 词表的 host 侧消费点收拢到 pluginManagementService 一处（插件的
// 事实源在 aibuddy-cli 进程，服务实现仍经 agent 协议往返——plugins 词表的收口归属
// 插件能力面自身的协议演进，不在会话 v4 词表范围内）。
// 注意与既有 IPluginsService（已 retired 的 marketplace pluginStore 通道）区分：
// 那套接口按 pluginName+marketplace 寻址且方法语义过时，不复用避免签名冲突。
import type { Event } from "@aibuddy/rpc";
import type {
  AIbuddyPluginOperationProgressNotification,
  AIbuddyPluginsConfigureResult,
  AIbuddyPluginsCancelOperationResult,
  AIbuddyPluginsDescribeResult,
  AIbuddyPluginsInstallResult,
  AIbuddyPluginsListResult,
  AIbuddyPluginsMarketplaceMutationResult,
  AIbuddyPluginsOverviewResult,
  AIbuddyPluginsReferenceCatalogResult,
  AIbuddyPluginsRestoreBuiltinResult,
  AIbuddyPluginsSetEnabledResult,
  AIbuddyPluginsUninstallResult,
  AIbuddyPluginsValidateResult,
} from "@aibuddy/shared";
import { ServiceChannels } from "@aibuddy/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  AIbuddyAgentAddPluginMarketplaceParams,
  AIbuddyAgentConfigurePluginParams,
  AIbuddyAgentCancelPluginOperationParams,
  AIbuddyAgentDescribePluginParams,
  AIbuddyAgentInstallPluginParams,
  AIbuddyAgentPluginReferenceCatalogParams,
  AIbuddyAgentResolveSuggestedPluginReferenceParams,
  AIbuddyAgentResetPluginConfigParams,
  AIbuddyAgentPluginViewParams,
  AIbuddyAgentRemovePluginMarketplaceParams,
  AIbuddyAgentRestoreBuiltinPluginParams,
  AIbuddyAgentSetPluginEnabledParams,
  AIbuddyAgentUninstallPluginParams,
  AIbuddyAgentUpdatePluginMarketplaceParams,
  AIbuddyAgentUpdatePluginParams,
  AIbuddyAgentValidatePluginParams,
} from "../aibuddy-agent/aibuddyAgentPluginParams.js";

export interface IPluginManagementService {
  listPlugins(params: AIbuddyAgentPluginViewParams): Promise<AIbuddyPluginsListResult>;
  /**
   * Plugin 对话引用 catalog：
   * 带 sessionId → session-owned 冻结 catalog；不带 → workspace 当前 catalog。
   * 实现路由到 workspace 级 agent client，不走插件管理独立进程。
   */
  getPluginReferenceCatalog(
    params: AIbuddyAgentPluginReferenceCatalogParams,
  ): Promise<AIbuddyPluginsReferenceCatalogResult>;
  resolveSuggestedPluginReference(
    params: AIbuddyAgentResolveSuggestedPluginReferenceParams,
  ): Promise<import("@aibuddy/shared").AIbuddyPluginsResolveSuggestedReferenceResult>;
  onDynamicPluginOperationProgress(
    operationId: string,
  ): Event<AIbuddyPluginOperationProgressNotification>;
  getPluginsOverview(params: AIbuddyAgentPluginViewParams): Promise<AIbuddyPluginsOverviewResult>;
  addPluginMarketplace(
    params: AIbuddyAgentAddPluginMarketplaceParams,
  ): Promise<AIbuddyPluginsMarketplaceMutationResult>;
  removePluginMarketplace(
    params: AIbuddyAgentRemovePluginMarketplaceParams,
  ): Promise<AIbuddyPluginsMarketplaceMutationResult>;
  updatePluginMarketplace(
    params: AIbuddyAgentUpdatePluginMarketplaceParams,
  ): Promise<AIbuddyPluginsMarketplaceMutationResult>;
  installPlugin(params: AIbuddyAgentInstallPluginParams): Promise<AIbuddyPluginsInstallResult>;
  cancelPluginOperation(
    params: AIbuddyAgentCancelPluginOperationParams,
  ): Promise<AIbuddyPluginsCancelOperationResult>;
  uninstallPlugin(params: AIbuddyAgentUninstallPluginParams): Promise<AIbuddyPluginsUninstallResult>;
  updatePlugin(params: AIbuddyAgentUpdatePluginParams): Promise<AIbuddyPluginsInstallResult>;
  restoreBuiltinPlugin(
    params: AIbuddyAgentRestoreBuiltinPluginParams,
  ): Promise<AIbuddyPluginsRestoreBuiltinResult>;
  configurePlugin(params: AIbuddyAgentConfigurePluginParams): Promise<AIbuddyPluginsConfigureResult>;
  resetPluginConfig(
    params: AIbuddyAgentResetPluginConfigParams,
  ): Promise<AIbuddyPluginsConfigureResult>;
  validatePlugin(params: AIbuddyAgentValidatePluginParams): Promise<AIbuddyPluginsValidateResult>;
  describePlugin(params: AIbuddyAgentDescribePluginParams): Promise<AIbuddyPluginsDescribeResult>;
  setPluginEnabled(params: AIbuddyAgentSetPluginEnabledParams): Promise<AIbuddyPluginsSetEnabledResult>;
}

export const IPluginManagementService = createServiceDescriptor<IPluginManagementService>(
  ServiceChannels.PluginManagement,
);
