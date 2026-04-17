import { defineStore } from "pinia";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/http";
import type { Buddy, CreateBuddyRequest, CreateBuddyResponse, UpdateBuddyRequest } from "@/types";

interface State {
  list: Buddy[];
  loaded: boolean;
}

export const useBuddiesStore = defineStore("buddies", {
  state: (): State => ({ list: [], loaded: false }),
  actions: {
    async fetchAll(): Promise<void> {
      this.list = await apiGet<Buddy[]>("/v1/admin/buddies");
      this.loaded = true;
    },
    async create(body: CreateBuddyRequest): Promise<CreateBuddyResponse> {
      const res = await apiPost<CreateBuddyResponse>("/v1/admin/buddies", body);
      this.list = [...this.list, res.buddy];
      return res;
    },
    async update(id: string, body: UpdateBuddyRequest): Promise<void> {
      const updated = await apiPatch<Buddy>(`/v1/admin/buddies/${id}`, body);
      this.list = this.list.map((b) => (b.id === id ? updated : b));
    },
    async remove(id: string): Promise<void> {
      await apiDelete<null>(`/v1/admin/buddies/${id}`);
      this.list = this.list.filter((b) => b.id !== id);
    },
    async rotateKey(id: string): Promise<string> {
      const res = await apiPost<{ apiKey: string }>(`/v1/admin/buddies/${id}/rotate-key`);
      return res.apiKey;
    },
  },
});
