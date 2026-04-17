<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { NCard, NDescriptions, NDescriptionsItem, NTag } from "naive-ui";
import ThreadMessageList from "@/components/ThreadMessageList.vue";
import { useThreadsStore } from "@/stores/threads";
import { relativeTime } from "@/lib/format";

const route = useRoute();
const store = useThreadsStore();
const id = computed(() => String(route.params.id));

onMounted(() => store.fetchOne(id.value));
</script>

<template>
  <div v-if="!store.current">Loading…</div>
  <NCard v-else :title="`Thread ${store.current.id.slice(0, 8)}`">
    <NDescriptions bordered :column="3">
      <NDescriptionsItem label="Hatchling">{{ store.current.hatchlingEmail }}</NDescriptionsItem>
      <NDescriptionsItem label="Status">
        <NTag :type="store.current.status === 'closed' ? 'default' : 'success'">{{ store.current.status }}</NTag>
      </NDescriptionsItem>
      <NDescriptionsItem label="Turns">{{ store.current.turns }} turns</NDescriptionsItem>
      <NDescriptionsItem label="Created">{{ relativeTime(store.current.createdAt) }}</NDescriptionsItem>
      <NDescriptionsItem v-if="store.current.closedAt" label="Closed">
        {{ relativeTime(store.current.closedAt) }}
      </NDescriptionsItem>
    </NDescriptions>
    <div style="margin-top: 24px">
      <ThreadMessageList :messages="store.current.messages" />
    </div>
  </NCard>
</template>
