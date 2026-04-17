import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { apiFetch, HttpError } from "../src/lib/http.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("apiFetch", () => {
  it("sends Authorization header when token provided", async () => {
    let seen: string | null = null;
    server.use(
      http.get("https://relay.test/v1/buddies", ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json([]);
      }),
    );
    await apiFetch({ baseUrl: "https://relay.test", path: "/v1/buddies", token: "abc" });
    expect(seen).toBe("Bearer abc");
  });

  it("omits Authorization header when no token", async () => {
    let seen: string | null = "sentinel";
    server.use(
      http.post("https://relay.test/v1/auth/oidc/device", ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json({ deviceCode: "x" });
      }),
    );
    await apiFetch({
      baseUrl: "https://relay.test",
      path: "/v1/auth/oidc/device",
      method: "POST",
    });
    expect(seen).toBeNull();
  });

  it("throws HttpError with status and code on 4xx", async () => {
    server.use(
      http.get("https://relay.test/v1/buddies", () =>
        HttpResponse.json({ code: "forbidden", message: "nope" }, { status: 403 }),
      ),
    );
    await expect(
      apiFetch({ baseUrl: "https://relay.test", path: "/v1/buddies", token: "t" }),
    ).rejects.toMatchObject({
      name: "HttpError",
      status: 403,
      code: "forbidden",
    });
  });

  it("wraps network errors as HttpError with code=network", async () => {
    await expect(
      apiFetch({ baseUrl: "https://does-not-resolve.invalid", path: "/x", token: "t" }),
    ).rejects.toMatchObject({ name: "HttpError", code: "network" });
  });

  it("aborts on timeout", async () => {
    server.use(
      http.get("https://relay.test/slow", async () => {
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.json({});
      }),
    );
    await expect(
      apiFetch({
        baseUrl: "https://relay.test",
        path: "/slow",
        token: "t",
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("returns parsed JSON on success", async () => {
    server.use(
      http.get("https://relay.test/v1/buddies", () => HttpResponse.json([{ id: "b1" }])),
    );
    const body = await apiFetch<{ id: string }[]>({
      baseUrl: "https://relay.test",
      path: "/v1/buddies",
      token: "t",
    });
    expect(body).toEqual([{ id: "b1" }]);
  });
});
