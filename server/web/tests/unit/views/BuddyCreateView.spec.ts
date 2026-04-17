import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes } from "@/router";
import BuddyCreateView from "@/views/BuddyCreateView.vue";
import { useBuddiesStore } from "@/stores/buddies";

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe("BuddyCreateView", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("submits form and reveals key once", async () => {
    const store = useBuddiesStore();
    const createSpy = vi.spyOn(store, "create").mockResolvedValue({
      buddy: {
        id: "b",
        name: "Odin",
        description: "d",
        acl: { mode: "public" },
        ownerEmail: "o@x",
        createdAt: "2026-04-01T00:00:00Z",
        online: false,
      },
      apiKey: "ck_live_once",
    });

    const w = mount(BuddyCreateView, { global: { plugins: [makeRouter()] } });
    await w.find('[data-test="name"] input').setValue("Odin");
    await w.find('[data-test="description"] textarea').setValue("Allfather");
    await w.find('[data-test="submit"]').trigger("click");
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith({
      name: "Odin",
      description: "Allfather",
      acl: { mode: "public" },
    });
    expect(w.text()).toContain("ck_live_once");
  });

  it("disables submit when name is empty", async () => {
    const w = mount(BuddyCreateView, { global: { plugins: [makeRouter()] } });
    const btn = w.find('[data-test="submit"]');
    expect(btn.attributes("disabled")).toBeDefined();
    await w.find('[data-test="name"] input').setValue("x");
    await w.find('[data-test="description"] textarea').setValue("y");
    expect(btn.attributes("disabled")).toBeUndefined();
  });
});
