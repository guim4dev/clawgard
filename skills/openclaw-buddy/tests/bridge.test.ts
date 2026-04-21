import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { Bridge } from "../src/bridge.js";
import type { BridgeConfig } from "../src/types.js";

const server = setupServer();
// "bypass" lets test requests hit the real ephemeral bridge while MSW still
// intercepts the bridge's outgoing calls to the gateway URL.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function buildConfig(port: number): BridgeConfig {
  return {
    port,
    host: "127.0.0.1",
    openclaw: {
      sessionKey: "sess-example",
      gatewayUrl: "http://gateway.test",
      timeoutMs: 5_000,
    },
  };
}

let bridge: Bridge;
let url: string;

beforeEach(async () => {
  bridge = new Bridge(buildConfig(0));
  await bridge.start();
  url = `http://127.0.0.1:${bridge.boundPort}`;
});

afterEach(async () => {
  await bridge.stop();
});

describe("Bridge", () => {
  it("GET /health returns ok with masked session key", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.status).toBe("ok");
    expect(body.sessionKey).toBe("sess-exa...");
    expect(body.gatewayUrl).toBe("http://gateway.test");
  });

  it("ignores query strings when routing", async () => {
    const res = await fetch(`${url}/health?trace=1`);
    expect(res.status).toBe(200);
  });

  it("POST /ask forwards to gateway and returns the answer", async () => {
    let gatewayBody: Record<string, unknown> | null = null;
    server.use(
      http.post("http://gateway.test/api/v1/sessions/send", async ({ request }) => {
        gatewayBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ reply: "pong" });
      }),
    );
    const res = await fetch(`${url}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "t1",
        question: "hi",
        askerEmail: "u@e.com",
        turn: 1,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "answer", content: "pong" });
    expect(String(gatewayBody!.message)).toContain("hi");
    expect(gatewayBody!.sessionKey).toBe("sess-example");
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await fetch(`${url}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid JSON/i);
  });

  it("OPTIONS returns 204 with CORS headers", async () => {
    const res = await fetch(`${url}/anything`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${url}/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
