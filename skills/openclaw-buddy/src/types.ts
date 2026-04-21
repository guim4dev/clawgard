export interface ClawgardQuestion {
  threadId: string;
  question: string;
  askerEmail: string;
  turn: number;
}

export interface ClawgardAnswer {
  type: "answer" | "clarification_request" | "close";
  content: string;
}

export interface OpenClawConfig {
  sessionKey: string;
  gatewayUrl: string;
  gatewayToken?: string;
  timeoutMs: number;
}

export interface BridgeConfig {
  port: number;
  host: string;
  openclaw: OpenClawConfig;
}
