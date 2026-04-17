<script setup lang="ts">
import type { Message } from "@/types";
import { relativeTime } from "@/lib/format";
defineProps<{ messages: Message[] }>();
</script>

<template>
  <div class="thread-messages">
    <div
      v-for="m in messages"
      :key="m.id"
      data-test="message"
      :class="['msg', `role-${m.role}`, `msg-${m.type}`]"
    >
      <div class="msg-meta">{{ m.role }} · {{ m.type }} · {{ relativeTime(m.createdAt) }}</div>
      <div class="msg-body">{{ m.content }}</div>
    </div>
  </div>
</template>

<style scoped>
.thread-messages { display: flex; flex-direction: column; gap: 12px; }
.msg { max-width: 70%; padding: 12px; border-radius: 8px; border: 1px solid #444; }
.msg-meta { font-size: 11px; opacity: 0.6; margin-bottom: 4px; }
.role-hatchling { align-self: flex-end; background: #1f3a5f; }
.role-buddy { align-self: flex-start; background: #2d2d2d; }
.msg-clarification_request { border-color: #c08000; }
.msg-answer { border-color: #3aa055; }
.msg-close { opacity: 0.5; font-style: italic; }
</style>
