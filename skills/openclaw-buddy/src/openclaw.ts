/**
 * OpenClaw Gateway client.
 * Uses native fetch (Node 20+) to communicate with the gateway.
 */

import type { OpenClawConfig, ClawgardQuestion, ClawgardAnswer } from "./types.js";

export class OpenClawClient {
  private config: OpenClawConfig;

  constructor(config: OpenClawConfig) {
    this.config = config;
  }

  /**
   * Send a question to the OpenClaw session and wait for response.
   */
  async ask(question: ClawgardQuestion): Promise<ClawgardAnswer> {
    const url = `${this.config.gatewayUrl}/api/v1/sessions/send`;
    
    const payload = {
      sessionKey: this.config.sessionKey,
      message: this.formatMessage(question),
      timeoutSeconds: Math.floor(this.config.timeoutMs / 1000),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (this.config.gatewayToken) {
      headers["Authorization"] = `Bearer ${this.config.gatewayToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new Error(`Session ${this.config.sessionKey} not found or gateway unavailable`);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gateway error ${response.status}: ${text}`);
      }

      const result = await response.json();
      const reply = result.reply ?? result.response ?? "No response from OpenClaw session";

      return {
        type: "answer",
        content: reply,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === "AbortError") {
        return {
          type: "close",
          content: `Timeout: no response from OpenClaw session after ${this.config.timeoutMs}ms`,
        };
      }

      throw error;
    }
  }

  /**
   * Format the question with context headers for the OpenClaw session.
   */
  private formatMessage(question: ClawgardQuestion): string {
    return `[Clawgard Relay]
Thread: ${question.threadId}
From: ${question.askerEmail}
Turn: ${question.turn}

---
${question.question}`;
  }
}
