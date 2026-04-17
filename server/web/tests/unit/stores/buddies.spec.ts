import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useBuddiesStore } from "@/stores/buddies";

const fetchMock = vi.fn();
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("buddies store", () => {
  it("fetches and caches list", async () => {
    const list = [
      { id: "a", name: "Odin", description: "", acl: { mode: "public" }, ownerEmail: "o@x", createdAt: "", online: true },
    ];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(list), { status: 200, headers: { "content-type": "application/json" } }));
    const store = useBuddiesStore();
    await store.fetchAll();
    expect(store.list).toHaveLength(1);
    expect(store.list[0].name).toBe("Odin");
  });

  it("creates a buddy and returns api key once", async () => {
    const created = {
      buddy: { id: "b", name: "Huginn", description: "thought", acl: { mode: "public" }, ownerEmail: "o@x", createdAt: "", online: false },
      apiKey: "ck_abcdef",
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(created), { status: 201, headers: { "content-type": "application/json" } }));
    const store = useBuddiesStore();
    const result = await store.create({ name: "Huginn", description: "thought", acl: { mode: "public" } });
    expect(result.apiKey).toBe("ck_abcdef");
    expect(store.list.find((b) => b.id === "b")).toBeTruthy();
  });

  it("deletes a buddy", async () => {
    const store = useBuddiesStore();
    store.$patch({ list: [{ id: "x", name: "", description: "", acl: { mode: "public" }, ownerEmail: "", createdAt: "", online: false }] });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await store.remove("x");
    expect(store.list).toHaveLength(0);
  });

  it("rotates api key", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ apiKey: "ck_new" }), { status: 200, headers: { "content-type": "application/json" } }));
    const store = useBuddiesStore();
    const key = await store.rotateKey("x");
    expect(key).toBe("ck_new");
  });
});
