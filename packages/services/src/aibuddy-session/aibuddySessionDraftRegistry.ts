import type { AIbuddySessionStateSnapshot } from "@aibuddy/shared";
import type {
  AIbuddySessionWorkspaceTarget,
  AIbuddyTaskTarget,
} from "#src/aibuddy-session/aibuddySession.js";

function getWorkspaceKey(target: AIbuddySessionWorkspaceTarget): string {
  return target.workspaceIdentity?.trim() || target.workspacePath;
}

function getSessionScopedKey(target: AIbuddyTaskTarget): string {
  return `${getWorkspaceKey(target)}\0${target.sessionId}`;
}

export function createAIbuddyDeferredDraftRegistry() {
  const sessionKeys = new Set<string>();

  return {
    remember(params: AIbuddySessionWorkspaceTarget, snapshot: AIbuddySessionStateSnapshot): void {
      sessionKeys.add(
        getSessionScopedKey({
          workspacePath: snapshot.session.workspace.workspacePath,
          workspaceIdentity:
            snapshot.session.workspace.workspaceIdentity ?? params.workspaceIdentity,
          sessionId: snapshot.session.sessionId,
        }),
      );
    },

    has(target: AIbuddyTaskTarget): boolean {
      return sessionKeys.has(getSessionScopedKey(target));
    },

    forget(target: AIbuddyTaskTarget): void {
      sessionKeys.delete(getSessionScopedKey(target));
    },
  };
}
