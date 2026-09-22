import type { Event, IDisposable } from "@aibuddy/rpc";
import type { AIbuddyProtocolMessage } from "@aibuddy/shared";

export type AIbuddyProtocolTransportKind = "stdio" | "websocket" | "memory";

export interface AIbuddyProtocolTransportClosedEvent {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  reason?: string;
}

export interface AIbuddyProtocolTransport extends IDisposable {
  readonly kind: AIbuddyProtocolTransportKind;
  readonly onMessage: Event<AIbuddyProtocolMessage>;
  readonly onClose: Event<AIbuddyProtocolTransportClosedEvent>;
  send(message: AIbuddyProtocolMessage): Promise<void>;
  disposeAndWait?(): Promise<void>;
}
