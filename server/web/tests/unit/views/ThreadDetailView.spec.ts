import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "@/router";
import ThreadDetailView from "@/views/ThreadDetailView.vue";
import { useThreadsStore } from "@/stores/threads";

describe("ThreadDetailView", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("loads and renders thread, including close reason", async () => {
    const store = useThreadsStore();
    vi.spyOn(store, "fetchOne").mockImplementation(async () => {
      store.$patch({
        current: {
          id: "t1",
          buddyId: "b1",
          hatchlingEmail: "u@x.io",
          status: "closed",
          turns: 2,
          createdAt: "2026-04-01T00:00:00Z",
          closedAt: "2026-04-01T00:01:00Z",
          messages: [
            { id: "m1", threadId: "t1", role: "hatchling", type: "question", content: "Q", createdAt: "2026-04-01T00:00:00Z" },
            { id: "m2", threadId: "t1", role: "buddy", type: "answer", content: "A", createdAt: "2026-04-01T00:00:05Z" },
            { id: "m3", threadId: "t1", role: "buddy", type: "close", content: "thread closed: ttl", createdAt: "2026-04-01T00:01:00Z" },
          ],
        },
      });
    });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/threads/t1");
    const w = mount(ThreadDetailView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain("thread closed: ttl");
    expect(w.text()).toContain("2 turns");
  });
});
