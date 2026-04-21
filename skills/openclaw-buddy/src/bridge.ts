/**
 * Minimal HTTP bridge using only Node.js built-in modules.
 * Receives questions from the hook and forwards to OpenClaw.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { BridgeConfig, ClawgardQuestion, ClawgardAnswer, PendingRequest } from "./types.js";
import { OpenClawClient } from "./openclaw.js";

export class Bridge {
  private config: BridgeConfig;
  private client: OpenClawClient;
  private server?: ReturnType<typeof createServer>;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(config: BridgeConfig) {
    this.config = config;
    this.client = new OpenClawClient(config.openclaw);
  }

  /**
   * Start the HTTP bridge server.
   */
  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(`🌉 Bridge listening on http://${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server!.on("error", reject);
    });
  }

  /**
   * Stop the bridge server.
   */
  async stop(): Promise<void> {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge shutting down"));
    }
    this.pendingRequests.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
      });
    }
  }

  /**
   * Process a question directly (used by integrated mode).
   */
  async processQuestion(question: ClawgardQuestion): Promise<ClawgardAnswer> {
    return this.client.ask(question);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url === "/health" && method === "GET") {
        this.sendJSON(res, 200, {
          status: "ok",
          sessionKey: this.config.openclaw.sessionKey.slice(0, 8) + "...",
          gatewayUrl: this.config.openclaw.gatewayUrl,
        });
        return;
      }

      if (url === "/ask" && method === "POST") {
        const body = await this.readBody(req);
        const question = JSON.parse(body) as ClawgardQuestion;
        
        const answer = await this.client.ask(question);
        this.sendJSON(res, 200, answer);
        return;
      }

      this.sendJSON(res, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendJSON(res, 500, { error: message });
    }
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  private sendJSON(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}
