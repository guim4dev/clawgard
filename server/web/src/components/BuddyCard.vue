<script setup lang="ts">
import { NCard, NTag, NButton, NSpace } from "naive-ui";
import type { Buddy } from "@/types";
import { aclLabel, relativeTime } from "@/lib/format";

defineProps<{ buddy: Buddy; canManage: boolean }>();
defineEmits<{ (e: "edit", id: string): void; (e: "delete", id: string): void }>();
</script>

<template>
  <NCard size="small" :title="buddy.name">
    <template #header-extra>
      <span
        :class="{ 'is-online': buddy.online, 'is-offline': !buddy.online }"
        data-test="online-indicator"
        :style="{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: buddy.online ? 'limegreen' : '#666',
        }"
      />
    </template>
    <NSpace vertical size="small">
      <span>{{ buddy.description }}</span>
      <NSpace size="small">
        <NTag size="small">{{ aclLabel(buddy.acl) }}</NTag>
        <NTag size="small" type="info">owner: {{ buddy.ownerEmail }}</NTag>
        <NTag size="small" type="default">created {{ relativeTime(buddy.createdAt) }}</NTag>
      </NSpace>
      <NSpace v-if="canManage" size="small">
        <NButton size="small" data-test="edit-buddy" @click="$emit('edit', buddy.id)">Edit</NButton>
        <NButton size="small" type="error" data-test="delete-buddy" @click="$emit('delete', buddy.id)">Delete</NButton>
      </NSpace>
    </NSpace>
  </NCard>
</template>
