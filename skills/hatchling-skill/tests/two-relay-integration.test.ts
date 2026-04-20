import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
  type Mock,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import { runSetup } from "../src/setup.js";
import { runList } from "../src/list.js";
import { runAsk } from "../src/ask.js";

vi.mock("open", () => ({ default: vi.fn(async () => null) }));
vi.mock("@clack/prompts", async () => {
  const actual = await vi.importActual<typeof import("@clack/prompts")>("@clack/prompts");
  return {
    ...actual,
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(),
    log: { info: vi.fn(), success: vi.fn(), error: vi.fn(), step: vi.fn() },
    text: vi.fn(),
    confirm: vi.fn(),
    isCancel: () => false,
  };
});

import { text, confirm } from "@clack/prompts";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => {
  sb.cleanup();
  vi.clearAllMocks();
});

const RELAY_A = "https://relay-a.test";
const RELAY_B = "https://relay-b.test";
const TOKEN_A = "tok-a-abc123";
const TOKEN_B = "tok-b-def456";
const BUDDY_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BUDDY_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THREAD_A_ID = "11111111-1111-1111-1111-111111111111";
const THREAD_B_ID = "22222222-2222-2222-2222-222222222222";

function buddyPayload(id: string, name: string) {
  return {
    id,
    name,
    description: `desc-${name}`,
    acl: { mode: "public" },
    ownerEmail: "owner@example.com",
    createdAt: new Date().toISOString(),
    online: true,
  };
}

function deviceFlowHandlers(baseUrl: string, accessToken: string) {
  return [
    http.post(`${baseUrl}/v1/auth/oidc/device`, () =>
      HttpResponse.json({
        deviceCode: `DC-${accessToken}`,
        userCode: "ABCD-1234",
        verificationUri: `${baseUrl}/activate`,
        interval: 0,
        expiresIn: 60,
      }),
    ),
    http.post(`${baseUrl}/v1/auth/oidc/token`, () =>
      HttpResponse.json({
        accessToken,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        email: "user@example.com",
      }),
    ),
  ];
}

function closedThreadHandlers(
  baseUrl: string,
  threadId: string,
  buddyId: string,
  answer: string,
  recordAuth: (label: string, auth: string | null) => void,
) {
  return [
    http.post(`${baseUrl}/v1/threads`, async ({ request }) => {
      recordAuth("threads", request.headers.get("authorization"));
      const body = (await request.json()) as { buddyId: string };
      expect(body.buddyId).toBe(buddyId);
      return HttpResponse.json(
        {
          id: threadId,
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
    http.get(`${baseUrl}/v1/threads/${threadId}`, () =>
      HttpResponse.json({
        id: threadId,
        buddyId,
        hatchlingEmail: "u@example.com",
        status: "closed",
        turns: 1,
        createdAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        messages: [
          {
            id: `msg-${threadId}`,
            threadId,
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

async function provisionRelay(
  env: NodeJS.ProcessEnv,
  alias: string,
  relayUrl: string,
  token: string,
): Promise<void> {
  (text as unknown as Mock).mockResolvedValueOnce(relayUrl);
  (confirm as unknown as Mock).mockResolvedValueOnce(false);
  server.use(...deviceFlowHandlers(relayUrl, token));
  await runSetup({ flags: { profile: alias }, env });
  server.resetHandlers();
}

function captureStdout() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    lines.push(args.map(String).join(" "));
  });
  return { text: () => lines.join("\n"), restore: () => spy.mockRestore() };
}

function captureStderr() {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stderr.write);
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

describe("two-relay end-to-end: setup → list → ask on both relays", () => {
  it("sets up two relays, lists both, and routes each ask to the right relay with the alias-scoped token", async () => {
    const env = sb.withEnv();

    await provisionRelay(env, "company-a", RELAY_A, TOKEN_A);
    await provisionRelay(env, "company-b", RELAY_B, TOKEN_B);

    // Config carries both aliases; tokens are stored per-alias and did not overwrite each other.
    const cfg = JSON.parse(
      readFileSync(join(sb.xdgConfigHome, "clawgard", "config.json"), "utf8"),
    );
    expect(cfg["company-a"].relayUrl).toBe(RELAY_A);
    expect(cfg["company-b"].relayUrl).toBe(RELAY_B);
    expect(
      readFileSync(
        join(sb.xdgConfigHome, "clawgard", "tokens", "company-a.token"),
        "utf8",
      ).trim(),
    ).toBe(TOKEN_A);
    expect(
      readFileSync(
        join(sb.xdgConfigHome, "clawgard", "tokens", "company-b.token"),
        "utf8",
      ).trim(),
    ).toBe(TOKEN_B);

    // --- LIST: fan-out must hit BOTH relays, each with its own alias-scoped token.
    const listAuth: Record<string, string | null> = {};
    server.use(
      http.get(`${RELAY_A}/v1/buddies`, ({ request }) => {
        listAuth["A"] = request.headers.get("authorization");
        return HttpResponse.json([buddyPayload(BUDDY_A_ID, "api-expert")]);
      }),
      http.get(`${RELAY_B}/v1/buddies`, ({ request }) => {
        listAuth["B"] = request.headers.get("authorization");
        return HttpResponse.json([buddyPayload(BUDDY_B_ID, "docs-guru")]);
      }),
    );

    const listOut = captureStdout();
    await runList({ flags: {}, env });
    listOut.restore();

    expect(listAuth["A"]).toBe(`Bearer ${TOKEN_A}`);
    expect(listAuth["B"]).toBe(`Bearer ${TOKEN_B}`);
    const listed = listOut.text();
    expect(listed).toContain("company-a/api-expert");
    expect(listed).toContain("company-b/docs-guru");

    // --- ASK company-a/api-expert → relay A only, Bearer TOKEN_A on every call.
    server.resetHandlers();
    const askAuthA: Record<string, string | null> = {};
    const recordA = (label: string, auth: string | null) => {
      askAuthA[label] = auth;
    };
    server.use(
      http.get(`${RELAY_A}/v1/buddies`, ({ request }) => {
        recordA("buddies", request.headers.get("authorization"));
        return HttpResponse.json([buddyPayload(BUDDY_A_ID, "api-expert")]);
      }),
      ...closedThreadHandlers(RELAY_A, THREAD_A_ID, BUDDY_A_ID, "A-answer", recordA),
    );

    const askAOut = captureStdout();
    await runAsk({
      flags: {},
      env,
      buddyRef: "company-a/api-expert",
      question: "what is X?",
    });
    askAOut.restore();

    expect(askAuthA["buddies"]).toBe(`Bearer ${TOKEN_A}`);
    expect(askAuthA["threads"]).toBe(`Bearer ${TOKEN_A}`);
    expect(askAOut.text()).toContain("A-answer");

    // --- ASK company-b/docs-guru → relay B only, Bearer TOKEN_B on every call.
    server.resetHandlers();
    const askAuthB: Record<string, string | null> = {};
    const recordB = (label: string, auth: string | null) => {
      askAuthB[label] = auth;
    };
    server.use(
      http.get(`${RELAY_B}/v1/buddies`, ({ request }) => {
        recordB("buddies", request.headers.get("authorization"));
        return HttpResponse.json([buddyPayload(BUDDY_B_ID, "docs-guru")]);
      }),
      ...closedThreadHandlers(RELAY_B, THREAD_B_ID, BUDDY_B_ID, "B-answer", recordB),
    );

    const askBOut = captureStdout();
    await runAsk({
      flags: {},
      env,
      buddyRef: "company-b/docs-guru",
      question: "what is Y?",
    });
    askBOut.restore();

    expect(askAuthB["buddies"]).toBe(`Bearer ${TOKEN_B}`);
    expect(askAuthB["threads"]).toBe(`Bearer ${TOKEN_B}`);
    expect(askAOut.text()).not.toContain("B-answer");
    expect(askBOut.text()).toContain("B-answer");
  });

  it("partial failure: `list` still returns relay A's buddies when relay B is down", async () => {
    const env = sb.withEnv();

    await provisionRelay(env, "company-a", RELAY_A, TOKEN_A);
    await provisionRelay(env, "company-b", RELAY_B, TOKEN_B);

    server.use(
      http.get(`${RELAY_A}/v1/buddies`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN_A}`);
        return HttpResponse.json([buddyPayload(BUDDY_A_ID, "api-expert")]);
      }),
      // Relay B simulates "down" — network-level failure, not a structured HTTP error.
      http.get(`${RELAY_B}/v1/buddies`, () => HttpResponse.error()),
    );

    const out = captureStdout();
    const errOut = captureStderr();
    await expect(runList({ flags: {}, env })).resolves.toBeUndefined();
    out.restore();
    errOut.restore();

    const combined = out.text() + "\n" + errOut.text();
    // Relay A's buddies still rendered.
    expect(combined).toContain("api-expert");
    expect(combined).toContain("company-a/api-expert");
    // Relay B rendered as an error row (alias named, failure surfaced), not as a thrown exception.
    expect(combined).toContain("company-b");
    expect(combined.toLowerCase()).toMatch(/error|failed|reach|network/);
  });
});
