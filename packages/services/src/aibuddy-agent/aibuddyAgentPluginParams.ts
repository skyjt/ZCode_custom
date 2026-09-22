import type {
  AIbuddyAgentMcpServer,
  AIbuddyAutomationScheduleRule,
  AIbuddyMcpListMode,
  ModelSelection,
} from "@aibuddy/shared";

export interface AIbuddyAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}

export interface AIbuddyAgentPluginViewParams extends AIbuddyAgentWorkspaceTarget {
  configScope?: "user" | "workspace";
}

export interface AIbuddyAgentListMcpServerStatusesParams extends AIbuddyAgentWorkspaceTarget {
  mcpServers?: AIbuddyAgentMcpServer[];
  mode?: AIbuddyMcpListMode;
}

export interface AIbuddyAgentAddPluginMarketplaceParams extends AIbuddyAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  source: string;
}

export interface AIbuddyAgentRemovePluginMarketplaceParams extends AIbuddyAgentWorkspaceTarget {
  marketplace: string;
}

export interface AIbuddyAgentUpdatePluginMarketplaceParams extends AIbuddyAgentWorkspaceTarget {
  marketplace?: string;
  operationId?: string;
}

export interface AIbuddyAgentInstallPluginParams extends AIbuddyAgentWorkspaceTarget {
  dryRun?: boolean;
  marketplace: string;
  operationId?: string;
  pluginName: string;
  scope?: "user" | "workspace";
}

export interface AIbuddyAgentCancelPluginOperationParams {
  operationId: string;
}

export interface AIbuddyAgentUninstallPluginParams extends AIbuddyAgentWorkspaceTarget {
  marketplace?: string;
  pluginId?: string;
  pluginName?: string;
  removeCache?: boolean;
}

export interface AIbuddyAgentUpdatePluginParams extends AIbuddyAgentWorkspaceTarget {
  pluginId?: string;
  marketplace?: string;
}

export interface AIbuddyAgentRestoreBuiltinPluginParams extends AIbuddyAgentWorkspaceTarget {
  pluginId: string;
}

export interface AIbuddyAgentConfigurePluginParams extends AIbuddyAgentWorkspaceTarget {
  clearOptionKeys?: string[];
  dryRun?: boolean;
  options: Record<string, unknown>;
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface AIbuddyAgentResetPluginConfigParams extends AIbuddyAgentWorkspaceTarget {
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface AIbuddyAgentValidatePluginParams extends AIbuddyAgentWorkspaceTarget {
  marketplace?: string;
  pluginName?: string;
  source?: string;
}

export interface AIbuddyAgentDescribePluginParams extends AIbuddyAgentWorkspaceTarget {
  marketplace: string;
  pluginName: string;
}

export interface AIbuddyAgentSetPluginEnabledParams extends AIbuddyAgentWorkspaceTarget {
  enabled: boolean;
  operationId?: string;
  pluginId: string;
  scope?: "user" | "workspace";
}

// Plugin 对话引用 catalog：
// 带 sessionId → session-owned 冻结 catalog（必须路由到持有该 session 的 workspace client）；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。
export interface AIbuddyAgentPluginReferenceCatalogParams extends AIbuddyAgentWorkspaceTarget {
  sessionId?: string;
}

// Composer Skill catalog：与 Plugin 引用相同，以 sessionId 区分 workspace 当前目录和
// resident Session runtime 快照；不参与 Settings 管理目录。
export interface AIbuddyAgentSkillReferenceCatalogParams extends AIbuddyAgentWorkspaceTarget {
  sessionId?: string;
}
export interface AIbuddyAgentResolveSuggestedPluginReferenceParams extends AIbuddyAgentWorkspaceTarget {
  stableId: string;
  operationId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryKind: "desktop-continuous" | "web-remote-replayable";
}

// ---- 定时任务(automation)管理参数 ----

export interface AIbuddyAgentCreateAutomationParams extends AIbuddyAgentWorkspaceTarget {
  title: string;
  cronExpr: string;
  relativeDelayMinutes?: number;
  prompt: string;
  modelSelection?: ModelSelection;
  mode?: string;
  recurring?: boolean;
  maxRuns?: number;
  endAt?: number;
  scheduleRule?: AIbuddyAutomationScheduleRule;
}

export interface AIbuddyAgentUpdateAutomationParams extends AIbuddyAgentWorkspaceTarget {
  automationId: string;
  title?: string;
  cronExpr?: string;
  prompt?: string;
  modelSelection?: ModelSelection | null;
  mode?: string | null;
  recurring?: boolean;
  maxRuns?: number | null;
  endAt?: number | null;
  scheduleRule?: AIbuddyAutomationScheduleRule | null;
  scheduleEditedByUser?: boolean;
}

export interface AIbuddyAgentAutomationIdParams extends AIbuddyAgentWorkspaceTarget {
  automationId: string;
}

export interface AIbuddyAgentSetAutomationEnabledParams extends AIbuddyAgentWorkspaceTarget {
  automationId: string;
  enabled: boolean;
}

export interface AIbuddyAgentDeleteAutomationRunParams extends AIbuddyAgentWorkspaceTarget {
  runId: string;
}
