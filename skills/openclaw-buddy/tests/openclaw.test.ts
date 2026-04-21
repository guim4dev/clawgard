import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { OpenClawClient } from "../src/openclaw.js";
import type { ClawgardQuestion, OpenClawConfig } from "../src/types.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const QUESTION: ClawgardQuestion = {
  threadId: "t-1",
  question: "what is 2+2?",
  askerEmail: "u@e.com",
  turn: 1,
};

const BASE: OpenClawConfig = {
  sessionKey: "sess-abc",
  gatewayUrl: "http://gateway.test",
  timeoutMs: 5_000,
};

describe("OpenClawClient.ask", () => {
  it("posts sessionKey + formatted message and returns reply", async () => {
    let seenPayload: Record<string, unknown> | null = null;
    let seenAuth: string | null = null;
    server.use(
      http.post("http://gateway.test/api/v1/sessions/send", async ({ request }) => {
        seenAuth = request.headers.get("authorization");
        seenPayload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ reply: "four" });
      }),
    );

    const client = new OpenClawClient(BASE);
    const ans = await client.ask(QUESTION);

    expect(ans).toEqual({ type: "answer", content: "four" });
    expect(seenPayload!.sessionKey).toBe("sess-abc");
    expect(seenPayload!.timeoutSeconds).toBe(5);
    expect(String(seenPayload!.message)).toContain("what is 2+2?");
    expect(String(seenPayload!.message)).toContain("t-1");
    expect(seenAuth).toBeNull();
  });

  it("falls back to `response` field when `reply` is absent", async () => {
    server.use(
      http.post("http://gateway.test/api/v1/sessions/send", () =>
        HttpResponse.json({ response: "alt" }),
      ),
    );
    const client = new OpenClawClient(BASE);
    const ans = await client.ask(QUESTION);
    expect(ans.content).toBe("alt");
  });

  it("sends Authorization header when gatewayToken is set", async () => {
    let auth: string | null = null;
    server.use(
      http.post("http://gateway.test/api/v1/sessions/send", ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ reply: "ok" });
      }),
    );
    const client = new OpenClawClient({ ...BASE, gatewayToken: "tkn" });
    await client.ask(QUESTION);
    expect(auth).toBe("Bearer tkn");
  });

  it("throws `not found` on 404 from gateway", async () => {
    server.use(
      http.post(
        "http://gateway.test/api/v1/sessions/send",
        () => new HttpResponse("nope", { status: 404 }),
      ),
    );
    const client = new OpenClawClient(BASE);
    await expect(client.ask(QUESTION)).rejects.toThrow(/not found/i);
  });

  it("throws `Gateway error <status>` on non-2xx non-404", async () => {
    server.use(
      http.post(
        "http://gateway.test/api/v1/sessions/send",
        () => new HttpResponse("boom", { status: 500 }),
      ),
    );
    const client = new OpenClawClient(BASE);
    await expect(client.ask(QUESTION)).rejects.toThrow(/Gateway error 500/);
  });

  it("returns a `close` answer on timeout", async () => {
    server.use(
      http.post("http://gateway.test/api/v1/sessions/send", async () => {
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.json({ reply: "late" });
      }),
    );
    const client = new OpenClawClient({ ...BASE, timeoutMs: 50 });
    const ans = await client.ask(QUESTION);
    expect(ans.type).toBe("close");
    expect(ans.content).toMatch(/Timeout/);
  });
});
