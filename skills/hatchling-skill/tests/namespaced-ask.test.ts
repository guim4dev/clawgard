import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import { writeConfig, writeToken } from "../src/lib/config.js";
import { runAsk } from "../src/ask.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let sb: Sandbox;
beforeEach(() => { sb = makeSandbox(); });
afterEach(() => sb.cleanup());

const THREAD_ID = "99999999-9999-9999-9999-999999999999";
const BUDDY_ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BUDDY_ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function seedTwoRelays(env: NodeJS.ProcessEnv): void {
  writeConfig({ relayUrl: "https://relay-a.test" }, "company-a", env);
  writeConfig({ relayUrl: "https://relay-b.test" }, "company-b", env);
  writeToken("tok-a", env, "company-a");
  writeToken("tok-b", env, "company-b");
}

function stubClosedThread(baseUrl: string, buddyId: string, answer: string) {
  return [
    http.post(`${baseUrl}/v1/threads`, async ({ request }) => {
      const body = (await request.json()) as { buddyId: string };
      expect(body.buddyId).toBe(buddyId);
      expect(request.headers.get("authorization")).toBeTruthy();
      return HttpResponse.json(
        {
          id: THREAD_ID,
          buddyId,
          hatchlingEmail: "u@example.com",
          status: "open",
          turns: 0,
          createdAt: new Date().toISOString(),
          messages: [],
        },
        { status: 201 },
      );
    }),
    http.get(`${baseUrl}/v1/threads/${THREAD_ID}`, () =>
      HttpResponse.json({
        id: THREAD_ID,
        buddyId,
        hatchlingEmail: "u@example.com",
        status: "closed",
        turns: 1,
        createdAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        messages: [
          {
            id: "m-a",
            threadId: THREAD_ID,
            role: "buddy",
            type: "answer",
            content: answer,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    ),
  ];
}

function buddyPayload(id: string, name: string, owner = "o@example.com") {
  return {
    id,
    name,
    description: "x",
    acl: { mode: "public" },
    ownerEmail: owner,
    createdAt: new Date().toISOString(),
    online: true,
  };
}

describe("runAsk — namespaced <alias>/<name> reference", () => {
  it("resolves <name> against /v1/buddies on the aliased relay and opens a thread there", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    let listedOnA = false;
    let listedOnB = false;
    server.use(
      http.get("https://relay-a.test/v1/buddies", ({ request }) => {
        listedOnA = true;
        expect(request.headers.get("authorization")).toBe("Bearer tok-a");
        return HttpResponse.json([buddyPayload(BUDDY_ID_A, "api-expert")]);
      }),
      http.get("https://relay-b.test/v1/buddies", () => {
        listedOnB = true;
        return HttpResponse.json([]);
      }),
      ...stubClosedThread("https://relay-a.test", BUDDY_ID_A, "A answered"),
    );

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) =>
      logs.push(a.map(String).join(" ")),
    );

    await runAsk({
      flags: {},
      env,
      buddyRef: "company-a/api-expert",
      question: "what is X?",
    });

    spy.mockRestore();
    expect(listedOnA).toBe(true);
    expect(listedOnB).toBe(false);
    expect(logs.join("\n")).toContain("A answered");
  });

  it("exits non-zero with a clear error when no buddy matches <name> on that relay", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json([buddyPayload(BUDDY_ID_B, "other-buddy")]),
      ),
    );

    await expect(
      runAsk({
        flags: {},
        env,
        buddyRef: "company-a/api-expert",
        question: "what is X?",
      }),
    ).rejects.toThrow(/no buddy.*api-expert.*company-a/i);
  });

  it("exits non-zero listing candidate UUIDs when <name> matches multiple buddies", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json([
          buddyPayload(BUDDY_ID_A, "api-expert"),
          buddyPayload(BUDDY_ID_B, "api-expert"),
        ]),
      ),
    );

    const err = await runAsk({
      flags: {},
      env,
      buddyRef: "company-a/api-expert",
      question: "q",
    }).then(
      () => null,
      (e: Error) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/multiple|ambiguous/i);
    expect(err!.message).toContain(BUDDY_ID_A);
    expect(err!.message).toContain(BUDDY_ID_B);
  });

  it("exits non-zero naming the unknown alias and listing configured aliases", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    const err = await runAsk({
      flags: {},
      env,
      buddyRef: "unknown-co/api-expert",
      question: "q",
    }).then(
      () => null,
      (e: Error) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("unknown-co");
    expect(err!.message).toContain("company-a");
    expect(err!.message).toContain("company-b");
  });
});

describe("runAsk — UUID fallback & legacy --profile", () => {
  it("when first positional arg is a UUID, does NOT call /v1/buddies (legacy path)", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    let listed = false;
    server.use(
      http.get("https://relay-a.test/v1/buddies", () => {
        listed = true;
        return HttpResponse.json([]);
      }),
      ...stubClosedThread("https://relay-a.test", BUDDY_ID_A, "direct"),
    );

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAsk({
      flags: { profile: "company-a" },
      env,
      buddyRef: BUDDY_ID_A,
      question: "q",
    });
    spy.mockRestore();

    expect(listed).toBe(false);
  });

  it("legacy form <uuid> --profile <alias> continues to work (no namespaced parsing)", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    let resolvedOnA = false;
    server.use(
      http.get("https://relay-a.test/v1/buddies", () => {
        resolvedOnA = true;
        return HttpResponse.json([]);
      }),
      ...stubClosedThread("https://relay-b.test", BUDDY_ID_B, "B answered"),
    );

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAsk({
      flags: { profile: "company-b" },
      env,
      buddyRef: BUDDY_ID_B,
      question: "q",
    });
    spy.mockRestore();

    expect(resolvedOnA).toBe(false);
  });
});
