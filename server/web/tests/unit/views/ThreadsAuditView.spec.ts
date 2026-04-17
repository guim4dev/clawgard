import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "@/router";
import ThreadsAuditView from "@/views/ThreadsAuditView.vue";
import { useThreadsStore } from "@/stores/threads";
import { useBuddiesStore } from "@/stores/buddies";

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe("ThreadsAuditView", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("calls store.fetchList with filters on submit", async () => {
    const store = useThreadsStore();
    const fetchSpy = vi.spyOn(store, "fetchList").mockResolvedValue();
    const buddies = useBuddiesStore();
    buddies.$patch({
      list: [
        {
          id: "b1",
          name: "Odin",
          description: "",
          acl: { mode: "public" },
          ownerEmail: "",
          createdAt: "2026-04-01T00:00:00Z",
          online: true,
        },
      ],
      loaded: true,
    });
    const w = mount(ThreadsAuditView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    await w.find('[data-test="filter-email"] input').setValue("user@x.io");
    await w.find('[data-test="apply-filters"]').trigger("click");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ hatchlingEmail: "user@x.io", page: 1 }),
    );
  });

  it("paginates via page controls", async () => {
    const store = useThreadsStore();
    const fetchSpy = vi.spyOn(store, "fetchList").mockResolvedValue();
    store.$patch({ total: 75, page: 1, pageSize: 25, items: [] });
    const buddies = useBuddiesStore();
    buddies.$patch({ list: [], loaded: true });
    const w = mount(ThreadsAuditView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    await w.find('[data-test="next-page"]').trigger("click");
    expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("renders one row per thread", async () => {
    const buddies = useBuddiesStore();
    buddies.$patch({ list: [], loaded: true });
    const store = useThreadsStore();
    vi.spyOn(store, "fetchList").mockImplementation(async () => {
      store.$patch({
        items: [
          {
            id: "t1",
            buddyId: "b1",
            hatchlingEmail: "u@x.io",
            status: "closed",
            turns: 1,
            createdAt: "2026-04-01T00:00:00Z",
            messages: [],
          },
          {
            id: "t2",
            buddyId: "b1",
            hatchlingEmail: "u@x.io",
            status: "open",
            turns: 0,
            createdAt: "2026-04-01T00:00:00Z",
            messages: [],
          },
        ],
        total: 2,
      });
    });
    const w = mount(ThreadsAuditView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(w.findAll('[data-test="thread-row"]').length).toBe(2);
  });
});
