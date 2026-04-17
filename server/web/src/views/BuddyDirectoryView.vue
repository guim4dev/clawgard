<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { NInput, NSpace, NButton, NGrid, NGridItem } from "naive-ui";
import BuddyCard from "@/components/BuddyCard.vue";
import { useBuddiesStore } from "@/stores/buddies";
import { useAuthStore } from "@/stores/auth";

const store = useBuddiesStore();
const auth = useAuthStore();
const router = useRouter();
const q = ref("");

onMounted(() => store.fetchAll());

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return store.list;
  return store.list.filter(
    (b) =>
      b.name.toLowerCase().includes(needle) ||
      b.description.toLowerCase().includes(needle) ||
      b.ownerEmail.toLowerCase().includes(needle),
  );
});

function canManage(): boolean {
  return auth.hasRole("admin");
}
</script>

<template>
  <NSpace vertical size="large">
    <NSpace justify="space-between">
      <NInput v-model:value="q" data-test="search" placeholder="Search buddies" style="max-width: 320px" />
      <NButton v-if="auth.hasRole('admin')" data-test="cta-new" type="primary" @click="router.push({ name: 'buddy-create' })">
        New buddy
      </NButton>
    </NSpace>
    <NGrid :x-gap="12" :y-gap="12" cols="1 s:2 m:3" responsive="screen">
      <NGridItem v-for="b in filtered" :key="b.id" data-test="buddy-card">
        <BuddyCard :buddy="b" :can-manage="canManage()" @edit="(id) => router.push({ name: 'buddy-detail', params: { id } })" />
      </NGridItem>
    </NGrid>
  </NSpace>
</template>
