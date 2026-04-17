import { defineStore } from "pinia";
import { apiGet, apiPost, HttpError } from "@/lib/http";
import type { MeResponse } from "@/types";
import type { Role } from "@/router";

interface State {
  me: MeResponse | null;
  loaded: boolean;
  loading: Promise<void> | null;
}

export const useAuthStore = defineStore("auth", {
  state: (): State => ({ me: null, loaded: false, loading: null }),
  getters: {
    hasRole:
      (state) =>
      (role: Role): boolean =>
        !!state.me && state.me.roles.includes(role),
  },
  actions: {
    async ensureLoaded(): Promise<void> {
      if (this.loaded) return;
      if (this.loading) return this.loading;
      this.loading = (async () => {
        try {
          this.me = await apiGet<MeResponse>("/v1/me");
        } catch (err) {
          if (err instanceof HttpError && err.status === 401) {
            this.me = null;
          } else {
            throw err;
          }
        } finally {
          this.loaded = true;
          this.loading = null;
        }
      })();
      return this.loading;
    },
    async logout(): Promise<void> {
      await apiPost<null>("/auth/logout");
      this.me = null;
      this.loaded = true;
    },
  },
});
