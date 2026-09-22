import type { AIbuddySessionStateSnapshot } from "@aibuddy/shared";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { repairImportedClaudeSessionSnapshot } from "#src/session/claude-native/importedClaudeHistoryRepair.js";
import type { IAIbuddyAgentService } from "#src/aibuddy-agent/aibuddyAgent.js";
import type {
  AIbuddySessionReadParams,
  AIbuddySessionResumeParams,
} from "#src/aibuddy-session/aibuddySession.js";

const logger = createServiceLogger("aibuddy-session-service");

export async function repairEmptyImportedClaudeSessionSnapshot(params: {
  agentService: IAIbuddyAgentService;
  snapshot: AIbuddySessionStateSnapshot;
  target: AIbuddySessionResumeParams | AIbuddySessionReadParams;
}): Promise<AIbuddySessionStateSnapshot> {
  const repaired = await repairImportedClaudeSessionSnapshot({
    snapshot: params.snapshot,
    target: {
      workspacePath: params.target.workspacePath,
      workspaceIdentity: params.target.workspaceIdentity,
      taskId: params.target.sessionId,
      ...("mcpServers" in params.target && params.target.mcpServers
        ? { mcpServers: params.target.mcpServers }
        : {}),
    },
    createSession: (input) => params.agentService.createSession(input),
    onRepair: (history) => {
      logger.warn(
        undefined,
        `[aibuddy-session-service] Claude 导入 session 历史异常，按 ${history.source} 回填 taskId=${params.target.sessionId}`,
      );
    },
  });
  return repaired ?? params.snapshot;
}
