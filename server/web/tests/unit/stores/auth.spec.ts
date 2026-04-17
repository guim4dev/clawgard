import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "@/stores/auth";

const fetchMock = vi.fn();
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("auth store", () => {
  it("loads /v1/me on ensureLoaded and caches", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ email: "a@x.io", roles: ["admin"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const auth = useAuthStore();
    await auth.ensureLoaded();
    expect(auth.me?.email).toBe("a@x.io");
    await auth.ensureLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sets me to null on 401", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const auth = useAuthStore();
    await auth.ensureLoaded();
    expect(auth.me).toBeNull();
  });

  it("hasRole returns correct booleans", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ email: "a@x.io", roles: ["buddy_owner", "hatchling"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const auth = useAuthStore();
    await auth.ensureLoaded();
    expect(auth.hasRole("admin")).toBe(false);
    expect(auth.hasRole("buddy_owner")).toBe(true);
    expect(auth.hasRole("hatchling")).toBe(true);
  });

  it("logout hits /auth/logout and clears me", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "a@x.io", roles: ["admin"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const auth = useAuthStore();
    await auth.ensureLoaded();
    await auth.logout();
    expect(auth.me).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/auth/logout");
  });
});
