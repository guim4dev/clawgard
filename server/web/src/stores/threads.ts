import { defineStore } from "pinia";
import { apiGet } from "@/lib/http";
import type { Thread } from "@/types";

export interface ThreadFilters {
  buddyId?: string;
  hatchlingEmail?: string;
  from?: string;
  to?: string;
  page?: number;
}

interface State {
  items: Thread[];
  total: number;
  page: number;
  pageSize: number;
  current: Thread | null;
}

export const useThreadsStore = defineStore("threads", {
  state: (): State => ({ items: [], total: 0, page: 1, pageSize: 25, current: null }),
  actions: {
    async fetchList(filters: ThreadFilters = {}): Promise<void> {
      const params = new URLSearchParams();
      if (filters.buddyId) params.set("buddyId", filters.buddyId);
      if (filters.hatchlingEmail) params.set("hatchlingEmail", filters.hatchlingEmail);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const page = filters.page ?? 1;
      params.set("page", String(page));
      params.set("pageSize", String(this.pageSize));
      const body = await apiGet<{ items: Thread[]; total: number }>(
        `/v1/admin/threads?${params}`,
      );
      this.items = body.items;
      this.total = body.total;
      this.page = page;
    },
    async fetchOne(id: string): Promise<void> {
      this.current = await apiGet<Thread>(`/v1/admin/threads/${id}`);
    },
  },
});
