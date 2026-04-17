import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import { writeConfig, writeToken } from "../src/lib/config.js";
import { runAsk } from "../src/ask.js";
import type { Message } from "../src/types.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  writeConfig({ relayUrl: "https://relay.test" }, "default", sb.withEnv());
  writeToken("tok", sb.withEnv());
});
afterEach(() => sb.cleanup());

function stubThreadOpen(threadId: string) {
  return http.post("https://relay.test/v1/threads", async ({ request }) => {
    const body = (await request.json()) as { buddyId: string; question: string };
    expect(body.buddyId).toBe("buddy-1");
    expect(body.question).toBe("what is X?");
    return HttpResponse.json({
      id: threadId,
      buddyId: "buddy-1",
      hatchlingEmail: "u@example.com",
      status: "open",
      turns: 0,
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: "m1",
          threadId,
          role: "hatchling",
          type: "question",
          content: "what is X?",
          createdAt: new Date().toISOString(),
        },
      ],
    }, { status: 201 });
  });
}

describe("runAsk — one-shot", () => {
  it("opens thread, polls until closed, prints the answer", async () => {
    const threadId = "11111111-1111-1111-1111-111111111111";
    let polls = 0;
    server.use(
      stubThreadOpen(threadId),
      http.get(`https://relay.test/v1/threads/${threadId}`, () => {
        polls++;
        if (polls < 2) {
          return HttpResponse.json({
            id: threadId,
            buddyId: "buddy-1",
            hatchlingEmail: "u@example.com",
            status: "open",
            turns: 0,
            createdAt: new Date().toISOString(),
            messages: [],
          });
        }
        return HttpResponse.json({
          id: threadId,
          buddyId: "buddy-1",
          hatchlingEmail: "u@example.com",
          status: "closed",
          turns: 1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
          messages: [
            {
              id: "m-answer",
              threadId,
              role: "buddy",
              type: "answer",
              content: "X is a thing.",
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }),
    );

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) =>
      logs.push(a.map(String).join(" ")),
    );

    await runAsk({
      flags: {},
      env: sb.withEnv(),
      buddyId: "buddy-1",
      question: "what is X?",
    });

    spy.mockRestore();
    expect(logs.join("\n")).toContain("X is a thing.");
  });
});

describe("runAsk — clarification flow", () => {
  it("replies to clarification_request using injected readReply, then prints the answer", async () => {
    const threadId = "22222222-2222-2222-2222-222222222222";
    let phase: "await_clarification" | "await_answer" | "closed" = "await_clarification";
    const receivedReplies: string[] = [];

    server.use(
      http.post("https://relay.test/v1/threads", () =>
        HttpResponse.json({
          id: threadId,
          buddyId: "b",
          hatchlingEmail: "u@example.com",
          status: "open",
          turns: 0,
          createdAt: new Date().toISOString(),
          messages: [],
        }, { status: 201 }),
      ),
      http.get(`https://relay.test/v1/threads/${threadId}`, () => {
        if (phase === "await_clarification") {
          return HttpResponse.json({
            id: threadId,
            buddyId: "b",
            hatchlingEmail: "u@example.com",
            status: "open",
            turns: 1,
            createdAt: new Date().toISOString(),
            messages: [
              {
                id: "cr1",
                threadId,
                role: "buddy",
                type: "clarification_request",
                content: "which X?",
                createdAt: new Date(Date.now() - 1000).toISOString(),
              },
            ],
          });
        }
        if (phase === "await_answer") {
          return HttpResponse.json({
            id: threadId,
            buddyId: "b",
            hatchlingEmail: "u@example.com",
            status: "closed",
            turns: 2,
            createdAt: new Date().toISOString(),
            closedAt: new Date().toISOString(),
            messages: [
              {
                id: "cr1",
                threadId,
                role: "buddy",
                type: "clarification_request",
                content: "which X?",
                createdAt: new Date(Date.now() - 1000).toISOString(),
              },
              {
                id: "c1",
                threadId,
                role: "hatchling",
                type: "clarification",
                content: "the payments X",
                createdAt: new Date().toISOString(),
              },
              {
                id: "a1",
                threadId,
                role: "buddy",
                type: "answer",
                content: "payments X is handled by …",
                createdAt: new Date().toISOString(),
              },
            ],
          });
        }
        return HttpResponse.json({ status: "closed" });
      }),
      http.post(`https://relay.test/v1/threads/${threadId}/messages`, async ({ request }) => {
        const body = (await request.json()) as { content: string };
        receivedReplies.push(body.content);
        phase = "await_answer";
        return HttpResponse.json({}, { status: 202 });
      }),
    );

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) =>
      logs.push(a.map(String).join(" ")),
    );

    await runAsk({
      flags: {},
      env: sb.withEnv(),
      buddyId: "b",
      question: "what is X?",
      readReply: async () => "the payments X",
    });
    spy.mockRestore();

    expect(receivedReplies).toEqual(["the payments X"]);
    expect(logs.join("\n")).toMatch(/which X\?/);
    expect(logs.join("\n")).toMatch(/payments X is handled by/);
  });

  it("stops sending replies after turn cap of 3", async () => {
    const threadId = "33333333-3333-3333-3333-333333333333";
    const receivedReplies: string[] = [];
    let callCount = 0;

    // Each poll returns a new clarification_request AFTER each hatchling reply,
    // simulating a buddy that keeps asking. We count how many replies we send.
    server.use(
      http.post("https://relay.test/v1/threads", () =>
        HttpResponse.json({
          id: threadId,
          buddyId: "b",
          hatchlingEmail: "u@example.com",
          status: "open",
          turns: 0,
          createdAt: new Date().toISOString(),
          messages: [],
        }, { status: 201 }),
      ),
      http.get(`https://relay.test/v1/threads/${threadId}`, () => {
        callCount++;
        // Build an ever-growing transcript where the last message is always a
        // new clarification_request newer than the last hatchling reply.
        const msgs: Message[] = [];
        const base = Date.now();
        for (let i = 0; i < receivedReplies.length; i++) {
          msgs.push({
            id: `cr${i}`,
            threadId,
            role: "buddy",
            type: "clarification_request",
            content: `cr ${i}`,
            createdAt: new Date(base + i * 100).toISOString(),
          } as Message);
          msgs.push({
            id: `c${i}`,
            threadId,
            role: "hatchling",
            type: "clarification",
            content: receivedReplies[i],
            createdAt: new Date(base + i * 100 + 10).toISOString(),
          } as Message);
        }
        msgs.push({
          id: `cr-latest-${callCount}`,
          threadId,
          role: "buddy",
          type: "clarification_request",
          content: "one more?",
          createdAt: new Date(base + 10_000 + callCount).toISOString(),
        } as Message);

        // Close the thread after we've observed the cap-hit log path twice
        // (ensures the loop doesn't busy-spin forever in the test).
        const status = callCount >= receivedReplies.length + 3 ? "closed" : "open";
        return HttpResponse.json({
          id: threadId,
          buddyId: "b",
          hatchlingEmail: "u@example.com",
          status,
          turns: receivedReplies.length,
          createdAt: new Date().toISOString(),
          closedAt: status === "closed" ? new Date().toISOString() : undefined,
          messages: msgs,
        });
      }),
      http.post(`https://relay.test/v1/threads/${threadId}/messages`, async ({ request }) => {
        const body = (await request.json()) as { content: string };
        receivedReplies.push(body.content);
        return HttpResponse.json({}, { status: 202 });
      }),
    );

    await runAsk({
      flags: {},
      env: sb.withEnv(),
      buddyId: "b",
      question: "what is X?",
      readReply: async () => "reply",
    });

    expect(receivedReplies).toHaveLength(3);
  });
});
