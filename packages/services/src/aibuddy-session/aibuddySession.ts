import { ServiceChannels } from "@aibuddy/shared";
import type {
  TraceId,
  AIbuddyAgentMcpServer,
  AIbuddyDeliveryKind,
  AIbuddyMessageWithParts,
  ModelSelection,
  AIbuddyPermissionRequestParams,
  AIbuddyUserInputRequestParams,
  AIbuddyUserInputResponse,
  AIbuddySessionInfo,
  AIbuddySessionImportHistory,
  AIbuddySessionEvent,
  AIbuddySessionMode,
  AIbuddySessionPersistence,
  AIbuddySessionStateSnapshot,
  AIbuddyStateUpdatedNotification,
  AIbuddyWorkspacePresentation,
} from "@aibuddy/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

export interface AIbuddySessionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export type AIbuddySessionReadWorkspacePresentationParams = AIbuddySessionWorkspaceTarget;

export interface AIbuddyTaskTarget extends AIbuddySessionWorkspaceTarget {
  sessionId: string;
}

export interface AIbuddySessionCreateParams extends AIbuddySessionWorkspaceTarget {
  /** 仅导入事务使用的预分配 ID；普通新会话继续由 Agent 分配。 */
  sessionId?: string;
  sessionTraceId?: TraceId;
  parentSessionId?: string;
  mode?: AIbuddySessionMode;
  model?: ModelSelection;
  persistence?: AIbuddySessionPersistence;
  thoughtLevel?: string;
  mcpServers?: AIbuddyAgentMcpServer[];
  importedHistory?: AIbuddySessionImportHistory;
}

export interface AIbuddySessionResumeParams extends AIbuddyTaskTarget {
  model?: ModelSelection;
  thoughtLevel?: string;
  mcpServers?: AIbuddyAgentMcpServer[];
  /**
   * 默认广播 resume 得到的历史快照，并让 shadow 订阅请求初始 snapshot。
   * 续聊发送前的 runtime 预恢复会关闭它，避免旧终态快照覆盖本地已开始的新输入运行态。
   */
  broadcastSnapshot?: boolean;
}

export interface AIbuddySessionListParams extends AIbuddySessionWorkspaceTarget {
  includeArchived?: boolean;
  limit?: number;
}

export interface AIbuddySessionReadParams extends AIbuddyTaskTarget {
  deliveryKind?: AIbuddyDeliveryKind;
  messageLimit?: number;
  afterSeq?: number;
}

export interface AIbuddySessionMessagesParams extends AIbuddyTaskTarget {
  afterMessageId?: string;
  limit?: number;
}

export interface AIbuddySessionEventsParams extends AIbuddyTaskTarget {
  afterSeq?: number;
  limit?: number;
}

export interface AIbuddySessionSetModelParams extends AIbuddyTaskTarget {
  model: ModelSelection;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface AIbuddySessionSetThoughtLevelParams extends AIbuddyTaskTarget {
  thoughtLevel?: string;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface AIbuddySessionSetModeParams extends AIbuddyTaskTarget {
  mode: AIbuddySessionMode;
  expectedRevision?: number;
}

export interface AIbuddySessionSubscribeParams extends AIbuddyTaskTarget {
  deliveryKind: AIbuddyDeliveryKind;
  afterSeq?: number;
  includeSnapshot?: boolean;
  eventCoalescing?: {
    mode: "background-summary";
    intervalMs?: number;
  };
}

export type AIbuddySessionServiceEvent =
  | { type: "session.event"; event: AIbuddySessionEvent }
  | { type: "state.updated"; notification: AIbuddyStateUpdatedNotification }
  | { type: "permission.request"; request: AIbuddyPermissionRequestParams }
  | { type: "userInput.request"; request: AIbuddyUserInputRequestParams }
  | {
      type: "userInput.response";
      requestId: string;
      response: AIbuddyUserInputResponse;
    }
  | { type: "snapshot"; snapshot: AIbuddySessionStateSnapshot };

export interface AIbuddySessionInitializeResult {
  available: boolean;
  workspaceKey: string;
  protocolName?: string;
  protocolVersion?: number;
  transportKind?: "stdio" | "websocket";
  reason?: string;
  reasonCode?: "provider_not_ready";
}

export interface AIbuddySessionWorkspaceRuntimeIdentity {
  generation: number;
  identity: string;
  processId?: number;
  workspaceKey: string;
}

export interface IAIbuddySessionService {
  initializeWorkspace(params: AIbuddySessionWorkspaceTarget): Promise<AIbuddySessionInitializeResult>;
  getWorkspaceRuntimeIdentity(
    params: AIbuddySessionWorkspaceTarget,
  ): Promise<AIbuddySessionWorkspaceRuntimeIdentity>;
  readWorkspacePresentation(
    params: AIbuddySessionReadWorkspacePresentationParams,
  ): Promise<AIbuddyWorkspacePresentation>;
  createSession(params: AIbuddySessionCreateParams): Promise<AIbuddySessionStateSnapshot>;
  resumeSession(params: AIbuddySessionResumeParams): Promise<AIbuddySessionStateSnapshot>;
  listSessions(params: AIbuddySessionListParams): Promise<AIbuddySessionInfo[]>;
  readSession(params: AIbuddySessionReadParams): Promise<AIbuddySessionStateSnapshot>;
  readSessionMessages(params: AIbuddySessionMessagesParams): Promise<AIbuddyMessageWithParts[]>;
  readSessionEvents(params: AIbuddySessionEventsParams): Promise<AIbuddySessionEvent[]>;
  promoteDeferredDraftSession(params: AIbuddyTaskTarget): Promise<void>;
  closeSession(params: AIbuddyTaskTarget): Promise<void>;
  closeDeferredDraftSession(params: AIbuddyTaskTarget): Promise<boolean>;
  setModel(params: AIbuddySessionSetModelParams): Promise<AIbuddySessionStateSnapshot>;
  setThoughtLevel(params: AIbuddySessionSetThoughtLevelParams): Promise<AIbuddySessionStateSnapshot>;
  setMode(params: AIbuddySessionSetModeParams): Promise<AIbuddySessionStateSnapshot>;
  // renderer 订阅面走 agentService 的 conversation/sessions-index 帧通道。
}

export const IAIbuddySessionService = createServiceDescriptor<IAIbuddySessionService>(
  ServiceChannels.AIbuddySession,
);
