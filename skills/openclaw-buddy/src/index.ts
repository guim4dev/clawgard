/**
 * OpenClaw Buddy - Run an OpenClaw agent as a Clawgard buddy.
 * 
 * @example
 * ```typescript
 * import { Bridge, OpenClawClient } from "@clawgard/openclaw-buddy";
 * 
 * const bridge = new Bridge({
 *   port: 8765,
 *   host: "127.0.0.1",
 *   openclaw: {
 *     sessionKey: "your-session-key",
 *     gatewayUrl: "http://localhost:8080",
 *     timeoutMs: 120000,
 *   },
 * });
 * 
 * await bridge.start();
 * ```
 */

export { Bridge } from "./bridge.js";
export { OpenClawClient } from "./openclaw.js";
export { runHook } from "./hook.js";
export type {
  ClawgardQuestion,
  ClawgardAnswer,
  OpenClawConfig,
  BridgeConfig,
} from "./types.js";

export const SKILL_NAME = "@clawgard/openclaw-buddy";
export const SKILL_VERSION = "0.1.0";
