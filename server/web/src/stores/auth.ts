import { defineStore } from "pinia";

export type Role = "admin" | "buddy_owner" | "hatchling";

export interface Me {
  email: string;
  roles: Role[];
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  loaded: boolean;
}

// Minimal auth-store shell. Task 4 adds `loadMe`, `/v1/me` integration,
// and `beginLogin` (PKCE entry). The shape here is the public surface the
// router guard and other stores bind against.
export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({ me: null, loading: false, loaded: false }),
  actions: {
    async ensureLoaded(): Promise<void> {
      if (this.loaded || this.loading) return;
      this.loaded = true;
    },
  },
});
