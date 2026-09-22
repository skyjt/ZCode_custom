/**
 * AIbuddy Agent Slash Commands 便捷 hook
 *
 * 返回当前 workspace 下 Agent 广播的可用 slash commands 列表。
 */
import { useAIbuddySessionStore, selectWorkspaceAIbuddyState } from "../store/aibuddySessionStore.js";

export function useSlashCommands(workspacePath: string, workspaceIdentity?: string) {
  return useAIbuddySessionStore(
    (state) => selectWorkspaceAIbuddyState(state, workspacePath, workspaceIdentity).slashCommands,
  );
}
