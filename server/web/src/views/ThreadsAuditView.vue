<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { NSpace, NInput, NSelect, NDatePicker, NButton, NDataTable, NPagination } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { useThreadsStore } from "@/stores/threads";
import { useBuddiesStore } from "@/stores/buddies";
import { relativeTime } from "@/lib/format";
import type { Thread } from "@/types";

const store = useThreadsStore();
const buddies = useBuddiesStore();
const router = useRouter();

const filterBuddy = ref<string | null>(null);
const filterEmail = ref("");
const dateRange = ref<[number, number] | null>(null);

const buddyOptions = computed(() =>
  buddies.list.map((b) => ({ label: b.name, value: b.id })),
);

const columns: DataTableColumns<Thread> = [
  {
    title: "Buddy",
    key: "buddyId",
    render: (row) => buddies.list.find((b) => b.id === row.buddyId)?.name ?? row.buddyId,
  },
  { title: "Hatchling", key: "hatchlingEmail" },
  { title: "Status", key: "status" },
  { title: "Turns", key: "turns" },
  { title: "Created", key: "createdAt", render: (row) => relativeTime(row.createdAt) },
];

async function apply(page = 1) {
  const [from, to] = dateRange.value ?? [];
  await store.fetchList({
    buddyId: filterBuddy.value ?? undefined,
    hatchlingEmail: filterEmail.value || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    page,
  });
}

function nextPage() {
  apply(store.page + 1);
}

onMounted(async () => {
  if (!buddies.loaded) await buddies.fetchAll();
  await apply();
});
</script>

<template>
  <NSpace vertical size="large">
    <NSpace align="center" wrap>
      <NSelect
        v-model:value="filterBuddy"
        :options="buddyOptions"
        placeholder="Buddy"
        clearable
        style="width: 220px"
      />
      <NInput
        v-model:value="filterEmail"
        data-test="filter-email"
        placeholder="Hatchling email"
        style="width: 260px"
      />
      <NDatePicker v-model:value="dateRange" type="daterange" clearable />
      <NButton data-test="apply-filters" type="primary" @click="apply(1)">Apply</NButton>
    </NSpace>

    <NDataTable
      :columns="columns"
      :data="store.items"
      :row-props="
        (row) => ({
          onClick: () =>
            router.push({ name: 'thread-detail', params: { id: row.id } }),
          'data-test': 'thread-row',
          style: 'cursor:pointer',
        })
      "
    />

    <NSpace justify="space-between" align="center">
      <NPagination
        :page="store.page"
        :page-count="Math.max(1, Math.ceil(store.total / store.pageSize))"
        :page-size="store.pageSize"
        @update:page="(p: number) => apply(p)"
      />
      <NButton size="small" data-test="next-page" @click="nextPage">Next</NButton>
    </NSpace>
  </NSpace>
</template>
