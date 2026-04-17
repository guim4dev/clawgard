import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { routes, installGuards } from "@/router";
import { useAuthStore } from "@/stores/auth";

function buildRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  installGuards(router);
  return router;
}

describe("router guards", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // The unauth->login redirect has to fully resolve LoginView (dynamic import
  // chain through Naive UI) on this first test run, which can take 20–25s on
  // a cold jsdom. Raise the ceiling just for this case.
  it("redirects unauthenticated users to /login", { timeout: 60_000 }, async () => {
    const router = buildRouter();
    const auth = useAuthStore();
    vi.spyOn(auth, "ensureLoaded").mockResolvedValue();
    auth.$patch({ me: null });
    await router.push("/buddies");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("redirects non-admins away from /buddies/new", async () => {
    const router = buildRouter();
    const auth = useAuthStore();
    vi.spyOn(auth, "ensureLoaded").mockResolvedValue();
    auth.$patch({ me: { email: "h@x.io", roles: ["hatchling"] } });
    await router.push("/buddies/new");
    expect(router.currentRoute.value.name).toBe("forbidden");
  });

  it("allows admin to reach /buddies/new", async () => {
    const router = buildRouter();
    const auth = useAuthStore();
    vi.spyOn(auth, "ensureLoaded").mockResolvedValue();
    auth.$patch({ me: { email: "a@x.io", roles: ["admin", "hatchling"] } });
    await router.push("/buddies/new");
    expect(router.currentRoute.value.name).toBe("buddy-create");
  });
});
