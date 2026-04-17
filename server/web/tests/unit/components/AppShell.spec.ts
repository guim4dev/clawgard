import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import AppShell from "@/components/AppShell.vue";
import { routes } from "@/router";
import { useAuthStore } from "@/stores/auth";

function buildRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe("AppShell", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("hides 'New buddy' nav item for hatchlings", async () => {
    const router = buildRouter();
    const auth = useAuthStore();
    vi.spyOn(auth, "ensureLoaded").mockResolvedValue();
    auth.$patch({ me: { email: "h@x.io", roles: ["hatchling"] }, loaded: true });
    await router.push("/buddies");
    const wrapper = mount(AppShell, {
      global: { plugins: [router] },
      slots: { default: "<div>content</div>" },
    });
    await router.isReady();
    expect(wrapper.text()).not.toContain("New buddy");
  });

  it("shows 'New buddy' for admins", async () => {
    const router = buildRouter();
    const auth = useAuthStore();
    vi.spyOn(auth, "ensureLoaded").mockResolvedValue();
    auth.$patch({ me: { email: "a@x.io", roles: ["admin"] }, loaded: true });
    await router.push("/buddies");
    const wrapper = mount(AppShell, {
      global: { plugins: [router] },
      slots: { default: "<div>content</div>" },
    });
    await router.isReady();
    expect(wrapper.text()).toContain("New buddy");
  });

  it("shows current user's email", async () => {
    const router = buildRouter();
    const auth = useAuthStore();
    vi.spyOn(auth, "ensureLoaded").mockResolvedValue();
    auth.$patch({ me: { email: "who@x.io", roles: ["hatchling"] }, loaded: true });
    await router.push("/buddies");
    const wrapper = mount(AppShell, { global: { plugins: [router] } });
    expect(wrapper.text()).toContain("who@x.io");
  });
});
