import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "@/router";
import BuddyDetailView from "@/views/BuddyDetailView.vue";
import { useBuddiesStore } from "@/stores/buddies";
import { useAuthStore } from "@/stores/auth";

describe("BuddyDetailView", () => {
  beforeEach(() => setActivePinia(createPinia()));

  async function setup(roles: Array<"admin" | "buddy_owner" | "hatchling">) {
    const store = useBuddiesStore();
    store.$patch({
      list: [
        {
          id: "b1",
          name: "Odin",
          description: "orig",
          acl: { mode: "public" },
          ownerEmail: "o@x.io",
          createdAt: "2026-04-01T00:00:00Z",
          online: true,
        },
      ],
      loaded: true,
    });
    const auth = useAuthStore();
    auth.$patch({ me: { email: "o@x.io", roles }, loaded: true });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/buddies/b1");
    await router.isReady();
    return { router, store };
  }

  it("rotates key and reveals it once", async () => {
    const { router, store } = await setup(["admin"]);
    vi.spyOn(store, "rotateKey").mockResolvedValue("ck_new_once");
    const w = mount(BuddyDetailView, { global: { plugins: [router] } });
    await flushPromises();
    await w.find('[data-test="rotate"]').trigger("click");
    await flushPromises();
    expect(w.text()).toContain("ck_new_once");
  });

  it("hides management controls for non-owner hatchlings", async () => {
    const store = useBuddiesStore();
    store.$patch({
      list: [
        {
          id: "b1",
          name: "Odin",
          description: "",
          acl: { mode: "public" },
          ownerEmail: "someone@else",
          createdAt: "2026-04-01T00:00:00Z",
          online: true,
        },
      ],
      loaded: true,
    });
    const auth = useAuthStore();
    auth.$patch({ me: { email: "h@x.io", roles: ["hatchling"] }, loaded: true });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/buddies/b1");
    await router.isReady();
    const w = mount(BuddyDetailView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-test="rotate"]').exists()).toBe(false);
    expect(w.find('[data-test="delete"]').exists()).toBe(false);
  });
});
