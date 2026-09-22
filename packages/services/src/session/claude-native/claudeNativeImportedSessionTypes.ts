import type { AIbuddyPersistedMessage, AIbuddyTaskPersistStatus } from "@aibuddy/shared";

/** 导入来源身份：外部原生 CLI（Claude Code），与 agent runtime 的 AIbuddyProvider 无关。 */
export type ClaudeNativeImportSourceProvider = "claude";

export interface ClaudeNativeImportedSessionSource {
  provider: ClaudeNativeImportSourceProvider;
  sessionId: string;
  workspacePath: string;
  sourcePath: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  model?: string;
  status?: AIbuddyTaskPersistStatus;
  migrationSource?: "claudeCode";
  messages: AIbuddyPersistedMessage[];
}
