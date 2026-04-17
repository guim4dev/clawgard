import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "@/router";
import BuddyDirectoryView from "@/views/BuddyDirectoryView.vue";
import { useBuddiesStore } from "@/stores/buddies";
import { useAuthStore } from "@/stores/auth";

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe("BuddyDirectoryView", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders one card per buddy", async () => {
    const buddies = useBuddiesStore();
    vi.spyOn(buddies, "fetchAll").mockImplementation(async () => {
      buddies.$patch({
        list: [
          { id: "a", name: "Odin", description: "", acl: { mode: "public" }, ownerEmail: "o@x", createdAt: "2026-04-01T00:00:00Z", online: true },
          { id: "b", name: "Thor", description: "", acl: { mode: "public" }, ownerEmail: "t@x", createdAt: "2026-04-01T00:00:00Z", online: false },
        ],
      });
    });
    const auth = useAuthStore();
    auth.$patch({ me: { email: "x@x", roles: ["hatchling"] }, loaded: true });

    const w = mount(BuddyDirectoryView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(w.findAll('[data-test="buddy-card"]').length).toBe(2);
  });

  it("filters by search term", async () => {
    const buddies = useBuddiesStore();
    vi.spyOn(buddies, "fetchAll").mockImplementation(async () => {
      buddies.$patch({
        list: [
          { id: "a", name: "Odin", description: "allfather", acl: { mode: "public" }, ownerEmail: "", createdAt: "2026-04-01T00:00:00Z", online: true },
          { id: "b", name: "Thor", description: "thunder", acl: { mode: "public" }, ownerEmail: "", createdAt: "2026-04-01T00:00:00Z", online: true },
        ],
      });
    });
    const auth = useAuthStore();
    auth.$patch({ me: { email: "x@x", roles: ["admin"] }, loaded: true });

    const w = mount(BuddyDirectoryView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    // NInput renders data-test on the wrapping div; the actual <input> is inside.
    await w.find('[data-test="search"] input').setValue("thor");
    expect(w.text()).toContain("Thor");
    expect(w.text()).not.toContain("Odin");
  });

  it("shows 'New buddy' CTA only for admins", async () => {
    const buddies = useBuddiesStore();
    vi.spyOn(buddies, "fetchAll").mockResolvedValue();

    const auth = useAuthStore();
    auth.$patch({ me: { email: "h@x", roles: ["hatchling"] }, loaded: true });
    const hatchling = mount(BuddyDirectoryView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(hatchling.find('[data-test="cta-new"]').exists()).toBe(false);

    auth.$patch({ me: { email: "a@x", roles: ["admin"] }, loaded: true });
    const admin = mount(BuddyDirectoryView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(admin.find('[data-test="cta-new"]').exists()).toBe(true);
  });
});
