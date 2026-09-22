export interface HelloMessage {
  type: "aibuddy-hello";
  version: string;
  platform: string;
  arch: string;
  pid: number;
}

export interface HelloAckMessage {
  type: "aibuddy-hello-ack";
  version: string;
  clientId: string;
}
