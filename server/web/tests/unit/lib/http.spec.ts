import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet, apiPost, HttpError } from "@/lib/http";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("apiGet / apiPost", () => {
  it("sends credentials:include and parses JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const body = await apiGet<{ ok: boolean }>("/v1/me");
    expect(body.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("throws HttpError with status + body on non-2xx", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "forbidden", message: "nope" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(apiGet("/v1/admin/buddies")).rejects.toMatchObject({
      status: 403,
      body: { code: "forbidden", message: "nope" },
    });
  });

  it("returns null on 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await apiPost<null>("/v1/admin/buddies/abc", undefined);
    expect(result).toBeNull();
  });

  it("exposes HttpError class", () => {
    const err = new HttpError(404, { code: "not_found", message: "" });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
  });
});
