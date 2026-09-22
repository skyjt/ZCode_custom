import type { AIbuddyStreamingToolInputState } from "./streaming-tool-input-preview.js";

export interface AIbuddyToolProjectionMemory {
  completeToolInputById?: Map<string, unknown>;
  streamingToolInputById?: Map<string, AIbuddyStreamingToolInputState>;
  toolNameById?: Map<string, string>;
}

export interface AIbuddyToolProjectionMetadata {
  hasInput: boolean;
  input?: unknown;
  toolName?: string;
}

export function createAIbuddyToolProjectionMemory(): AIbuddyToolProjectionMemory {
  return {
    completeToolInputById: new Map<string, unknown>(),
    streamingToolInputById: new Map<string, AIbuddyStreamingToolInputState>(),
    toolNameById: new Map<string, string>(),
  };
}

export function ensureAIbuddyToolProjectionMemory(
  memory: AIbuddyToolProjectionMemory,
): AIbuddyToolProjectionMemory {
  memory.completeToolInputById ??= new Map<string, unknown>();
  memory.streamingToolInputById ??= new Map<string, AIbuddyStreamingToolInputState>();
  memory.toolNameById ??= new Map<string, string>();
  return memory;
}

export function resolveAIbuddyToolProjectionMetadata(
  payload: Record<string, unknown>,
  toolId: string,
  memory: AIbuddyToolProjectionMemory,
): AIbuddyToolProjectionMetadata {
  const toolName = readNonEmptyString(payload.toolName) ?? memory.toolNameById?.get(toolId);
  if (toolName) {
    memory.toolNameById?.set(toolId, toolName);
  }

  if ("input" in payload) {
    return {
      hasInput: payload.input !== undefined,
      input: payload.input,
      toolName,
    };
  }

  if (memory.completeToolInputById?.has(toolId)) {
    return {
      hasInput: true,
      input: memory.completeToolInputById.get(toolId),
      toolName,
    };
  }

  return {
    hasInput: false,
    toolName,
  };
}

export function finalizeAIbuddyToolProjectionInput(
  toolId: string,
  input: unknown,
  memory: AIbuddyToolProjectionMemory,
): void {
  memory.completeToolInputById ??= new Map<string, unknown>();
  memory.completeToolInputById.set(toolId, input);
  const streamingState = memory.streamingToolInputById?.get(toolId);
  if (streamingState) {
    streamingState.lastPreviewRawInputLength = streamingState.rawInput.length;
    streamingState.rawInput = "";
  }
}

export function forgetAIbuddyToolProjectionMetadata(
  toolId: string,
  memory: AIbuddyToolProjectionMemory,
): void {
  memory.completeToolInputById?.delete(toolId);
  memory.streamingToolInputById?.delete(toolId);
  memory.toolNameById?.delete(toolId);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
