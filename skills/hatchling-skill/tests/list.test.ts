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

describe("runList", () => {
  it("prints id, name, description, online status for each buddy", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay.test" }, "default", env);
    writeToken("tok", env, "default");

    server.use(
      http.get("https://relay.test/v1/buddies", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        return HttpResponse.json([
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            name: "huginn-payments",
            description: "payments domain expert",
            acl: { mode: "public" },
            ownerEmail: "p@example.com",
            createdAt: new Date().toISOString(),
            online: true,
          },
          {
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            name: "muninn-docs",
            description: "docs archivist",
            acl: { mode: "public" },
            ownerEmail: "d@example.com",
            createdAt: new Date().toISOString(),
            online: false,
          },
        ]);
      }),
    );

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });

    await runList({ flags: {}, env });
    spy.mockRestore();

    const all = logs.join("\n");
    expect(all).toContain("huginn-payments");
    expect(all).toContain("payments domain expert");
    expect(all).toContain("online");
    expect(all).toContain("muninn-docs");
    expect(all).toContain("offline");
  });

  it("errors clearly when no token is configured", async () => {
    const env = sb.withEnv();
    writeConfig({ relayUrl: "https://relay.test" }, "default", env);
    await expect(runList({ flags: {}, env })).rejects.toThrow(/setup/i);
  });
});
