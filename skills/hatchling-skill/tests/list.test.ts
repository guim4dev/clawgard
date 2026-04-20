import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { makeSandbox, type Sandbox } from "./helpers/fs-sandbox.js";
import { writeConfig, writeToken } from "../src/lib/config.js";
import { runList } from "../src/list.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let sb: Sandbox;
beforeEach(() => { sb = makeSandbox(); });
afterEach(() => sb.cleanup());

function buddy(id: string, name: string, owner = "o@example.com", online = true, description = "x") {
  return {
    id,
    name,
    description,
    acl: { mode: "public" },
    ownerEmail: owner,
    createdAt: new Date().toISOString(),
    online,
  };
}

function captureStdout() {
  const logs: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
  return {
    text: () => logs.join("\n"),
    lines: logs,
    restore: () => spy.mockRestore(),
  };
}

function captureStderr() {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stderr.write);
  return {
    text: () => chunks.join(""),
    restore: () => spy.mockRestore(),
  };
}

describe("runList — single-profile (backward compat)", () => {
  it("prints id, name, description, online status, and ref for each buddy", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay.test" }, "default", env);
    writeToken("tok", env, "default");

    server.use(
      http.get("https://relay.test/v1/buddies", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        return HttpResponse.json([
          buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "huginn-payments", "p@example.com", true, "payments domain expert"),
          buddy("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "muninn-docs", "d@example.com", false, "docs archivist"),
        ]);
      }),
    );

    const out = captureStdout();
    await runList({ flags: { profile: "default" }, env });
    out.restore();

    const all = out.text();
    expect(all).toContain("huginn-payments");
    expect(all).toContain("payments domain expert");
    expect(all).toContain("online");
    expect(all).toContain("muninn-docs");
    expect(all).toContain("offline");
    // AC 5: ref column still present in single-profile output.
    expect(all).toContain("default/huginn-payments");
    expect(all).toContain("default/muninn-docs");
  });

  it("errors clearly when no token is configured", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay.test" }, "default", env);
    await expect(runList({ flags: { profile: "default" }, env })).rejects.toThrow(/setup/i);
  });
});

describe("runList — multi-relay fan-out", () => {
  function seedTwoRelays(env: NodeJS.ProcessEnv): void {
    writeConfig({ relayUrl: "https://relay-a.test" }, "company-a", env);
    writeConfig({ relayUrl: "https://relay-b.test" }, "company-b", env);
    writeToken("tok-a", env, "company-a");
    writeToken("tok-b", env, "company-b");
  }

  it("fans out to every configured relay and groups output by alias in alphabetical order", async () => {
    const env = sb.withEnv();
    // Seed in a non-alphabetical order to prove sort is deterministic.
    writeConfig({ relayUrl: "https://relay-b.test" }, "company-b", env);
    writeConfig({ relayUrl: "https://relay-a.test" }, "company-a", env);
    writeToken("tok-a", env, "company-a");
    writeToken("tok-b", env, "company-b");

    server.use(
      http.get("https://relay-a.test/v1/buddies", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok-a");
        return HttpResponse.json([buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "api-expert")]);
      }),
      http.get("https://relay-b.test/v1/buddies", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok-b");
        return HttpResponse.json([buddy("cccccccc-cccc-cccc-cccc-cccccccccccc", "docs-guru")]);
      }),
    );

    const out = captureStdout();
    await runList({ flags: {}, env });
    out.restore();

    const all = out.text();
    // Both relay sections present.
    expect(all).toContain("company-a");
    expect(all).toContain("company-b");
    expect(all).toContain("api-expert");
    expect(all).toContain("docs-guru");
    // Refs present with <alias>/<name> format.
    expect(all).toContain("company-a/api-expert");
    expect(all).toContain("company-b/docs-guru");
    // Deterministic ordering: company-a section appears BEFORE company-b section.
    expect(all.indexOf("company-a")).toBeLessThan(all.indexOf("company-b"));
  });

  it("orders buddies alphabetically within each alias section", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        // Response order is reversed; output must still be alphabetical.
        HttpResponse.json([
          buddy("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", "zeta"),
          buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "alpha"),
          buddy("mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm", "mu"),
        ]),
      ),
      http.get("https://relay-b.test/v1/buddies", () => HttpResponse.json([])),
    );

    const out = captureStdout();
    await runList({ flags: {}, env });
    out.restore();

    const all = out.text();
    const iAlpha = all.indexOf("alpha");
    const iMu = all.indexOf("mu  ");
    const iZeta = all.indexOf("zeta");
    expect(iAlpha).toBeGreaterThan(-1);
    expect(iMu).toBeGreaterThan(iAlpha);
    expect(iZeta).toBeGreaterThan(iMu);
  });

  it("prints partial results and an error row when one relay fails (network), exits 0", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json([buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "api-expert")]),
      ),
      http.get("https://relay-b.test/v1/buddies", () =>
        HttpResponse.json({ code: "unauthorized", message: "bad token" }, { status: 401 }),
      ),
    );

    const out = captureStdout();
    const errOut = captureStderr();
    // Must NOT throw — partial success.
    await expect(runList({ flags: {}, env })).resolves.toBeUndefined();
    out.restore();
    errOut.restore();

    const combined = out.text() + "\n" + errOut.text();
    expect(combined).toContain("api-expert");
    expect(combined).toMatch(/company-b/);
    expect(combined.toLowerCase()).toMatch(/error|failed|bad token|unauthorized/);
  });

  it("exits non-zero when every relay fails", async () => {
    const env = sb.withEnv();
    seedTwoRelays(env);

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json({ code: "unauthorized", message: "bad token" }, { status: 401 }),
      ),
      http.get("https://relay-b.test/v1/buddies", () =>
        HttpResponse.json({ code: "unauthorized", message: "bad token" }, { status: 401 }),
      ),
    );

    const out = captureStdout();
    const errOut = captureStderr();
    await expect(runList({ flags: {}, env })).rejects.toThrow();
    out.restore();
    errOut.restore();
  });

  it("handles a missing-token relay as a labeled failure (not a thrown error) when other relays work", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay-a.test" }, "company-a", env);
    writeConfig({ relayUrl: "https://relay-b.test" }, "company-b", env);
    writeToken("tok-a", env, "company-a");
    // company-b has NO token.

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json([buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "api-expert")]),
      ),
    );

    const out = captureStdout();
    const errOut = captureStderr();
    await expect(runList({ flags: {}, env })).resolves.toBeUndefined();
    out.restore();
    errOut.restore();

    const combined = out.text() + "\n" + errOut.text();
    expect(combined).toContain("api-expert");
    expect(combined).toContain("company-b");
    expect(combined.toLowerCase()).toMatch(/token|setup/);
  });
});

describe("runList — --json", () => {
  it("emits a flat array of {relay, ref, id, name, description, ownerEmail, online} across relays", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay-a.test" }, "company-a", env);
    writeConfig({ relayUrl: "https://relay-b.test" }, "company-b", env);
    writeToken("tok-a", env, "company-a");
    writeToken("tok-b", env, "company-b");

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json([
          buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "api-expert", "a@example.com", true, "APIs"),
        ]),
      ),
      http.get("https://relay-b.test/v1/buddies", () =>
        HttpResponse.json([
          buddy("cccccccc-cccc-cccc-cccc-cccccccccccc", "docs-guru", "d@example.com", false, "Docs"),
        ]),
      ),
    );

    const out = captureStdout();
    await runList({ flags: { json: true }, env });
    out.restore();

    const parsed = JSON.parse(out.text());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    const a = parsed.find((r: { ref: string }) => r.ref === "company-a/api-expert");
    expect(a).toEqual({
      relay: "company-a",
      ref: "company-a/api-expert",
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "api-expert",
      description: "APIs",
      ownerEmail: "a@example.com",
      online: true,
    });

    const b = parsed.find((r: { ref: string }) => r.ref === "company-b/docs-guru");
    expect(b).toEqual({
      relay: "company-b",
      ref: "company-b/docs-guru",
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      name: "docs-guru",
      description: "Docs",
      ownerEmail: "d@example.com",
      online: false,
    });
  });

  it("--json with --profile emits single-relay array", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay-a.test" }, "company-a", env);
    writeToken("tok-a", env, "company-a");

    server.use(
      http.get("https://relay-a.test/v1/buddies", () =>
        HttpResponse.json([
          buddy("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "api-expert", "a@example.com"),
        ]),
      ),
    );

    const out = captureStdout();
    await runList({ flags: { profile: "company-a", json: true }, env });
    out.restore();

    const parsed = JSON.parse(out.text());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].ref).toBe("company-a/api-expert");
    expect(parsed[0].relay).toBe("company-a");
  });
});
