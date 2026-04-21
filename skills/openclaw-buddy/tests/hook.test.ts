import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { askBridge, resolveBridgeUrl } from "../src/hook.js";
import type { ClawgardQuestion } from "../src/types.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const QUESTION: ClawgardQuestion = {
  threadId: "t1",
  question: "q",
  askerEmail: "u@e.com",
  turn: 1,
};

describe("resolveBridgeUrl", () => {
  it("prefers --bridge-url=<url> over env", () => {
    const got = resolveBridgeUrl(
      ["--hook-only", "--bridge-url=http://flag.test:9999"],
      { OPENCLAW_BRIDGE_URL: "http://env.test" } as NodeJS.ProcessEnv,
    );
    expect(got).toBe("http://flag.test:9999");
  });

  it("falls back to OPENCLAW_BRIDGE_URL env", () => {
    const got = resolveBridgeUrl(
      ["--hook-only"],
      { OPENCLAW_BRIDGE_URL: "http://env.test" } as NodeJS.ProcessEnv,
    );
    expect(got).toBe("http://env.test");
  });

  it("defaults to http://localhost:8765", () => {
    expect(resolveBridgeUrl([], {} as NodeJS.ProcessEnv)).toBe("http://localhost:8765");
  });
});

describe("askBridge", () => {
  it("POSTs question and returns parsed answer", async () => {
    let seen: unknown = null;
    server.use(
      http.post("http://bridge.test/ask", async ({ request }) => {
        seen = await request.json();
        return HttpResponse.json({ type: "answer", content: "ok" });
      }),
    );
    const ans = await askBridge("http://bridge.test", QUESTION);
    expect(ans).toEqual({ type: "answer", content: "ok" });
    expect(seen).toEqual(QUESTION);
  });

  it("throws on non-2xx bridge response", async () => {
    server.use(
      http.post(
        "http://bridge.test/ask",
        () => new HttpResponse("boom", { status: 500 }),
      ),
    );
    await expect(askBridge("http://bridge.test", QUESTION)).rejects.toThrow(
      /Bridge error 500/,
    );
  });
});
