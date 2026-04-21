import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { BridgeConfig, ClawgardQuestion } from "./types.js";
import { OpenClawClient } from "./openclaw.js";

export class Bridge {
  private config: BridgeConfig;
  private client: OpenClawClient;
  private server?: ReturnType<typeof createServer>;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.client = new OpenClawClient(config.openclaw);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.config.port, this.config.host, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
  }

  /** Port the server is actually bound to — useful when `config.port` was 0. */
  get boundPort(): number {
    const addr = this.server?.address();
    if (addr && typeof addr === "object") return (addr as AddressInfo).port;
    return this.config.port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawUrl = req.url ?? "/";
    const method = req.method ?? "GET";

    // Parse the path so query strings don't break routing.
    const pathname = new URL(rawUrl, "http://bridge.local").pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname === "/health" && method === "GET") {
        this.sendJSON(res, 200, {
          status: "ok",
          sessionKey: maskSessionKey(this.config.openclaw.sessionKey),
          gatewayUrl: this.config.openclaw.gatewayUrl,
        });
        return;
      }

      if (pathname === "/ask" && method === "POST") {
        const body = await readBody(req);
        let question: ClawgardQuestion;
        try {
          question = JSON.parse(body) as ClawgardQuestion;
        } catch {
          this.sendJSON(res, 400, { error: "invalid JSON body" });
          return;
        }
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

  private sendJSON(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}

function maskSessionKey(sessionKey: string): string {
  if (sessionKey.length <= 8) return "***";
  return `${sessionKey.slice(0, 8)}...`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
