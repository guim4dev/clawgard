<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NRadioGroup, NRadio, NInput, NFormItem, NSpace } from "naive-ui";
import type { Acl } from "@/types";

const props = defineProps<{ modelValue: Acl }>();
const emit = defineEmits<{ (e: "update:modelValue", v: Acl): void }>();

const mode = ref<Acl["mode"]>(props.modelValue.mode);
const groupId = ref(props.modelValue.groupId ?? "");
const usersRaw = ref((props.modelValue.users ?? []).join(", "));

watch([mode, groupId, usersRaw], () => {
  if (mode.value === "public") emit("update:modelValue", { mode: "public" });
  else if (mode.value === "group") emit("update:modelValue", { mode: "group", groupId: groupId.value });
  else emit("update:modelValue", { mode: "users", users: parseUsers(usersRaw.value) });
});

function parseUsers(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalidEmails = computed(() => {
  if (mode.value !== "users") return [];
  return (props.modelValue.users ?? []).filter((e) => !emailRegex.test(e));
});
</script>

<template>
  <NSpace vertical>
    <NRadioGroup :value="mode" @update:value="(v) => (mode = v as Acl['mode'])">
      <NRadio value="public" data-test="mode-public">Public</NRadio>
      <NRadio value="group" data-test="mode-group">SSO group</NRadio>
      <NRadio value="users" data-test="mode-users">Explicit users</NRadio>
    </NRadioGroup>

    <NFormItem v-if="mode === 'group'" label="Group ID">
      <NInput v-model:value="groupId" data-test="group-id" placeholder="engineering" />
    </NFormItem>

    <NFormItem v-if="mode === 'users'" label="Emails (comma-separated)">
      <NInput v-model:value="usersRaw" data-test="users-emails" placeholder="a@x.io, b@x.io" />
      <div v-if="invalidEmails.length" style="color: var(--n-error-color); font-size: 12px">
        Each entry must be a valid email.
      </div>
    </NFormItem>
  </NSpace>
</template>
