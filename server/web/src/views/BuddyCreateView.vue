<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { NForm, NFormItem, NInput, NButton, NSpace, NCard } from "naive-ui";
import AclEditor from "@/components/AclEditor.vue";
import ApiKeyReveal from "@/components/ApiKeyReveal.vue";
import { useBuddiesStore } from "@/stores/buddies";
import type { Acl } from "@/types";

const store = useBuddiesStore();
const router = useRouter();
const name = ref("");
const description = ref("");
const acl = ref<Acl>({ mode: "public" });
const revealKey = ref<string | null>(null);
const createdId = ref<string | null>(null);
const submitting = ref(false);

const canSubmit = computed(
  () => !!name.value.trim() && !!description.value.trim() && !submitting.value,
);

async function submit() {
  submitting.value = true;
  try {
    const res = await store.create({
      name: name.value.trim(),
      description: description.value.trim(),
      acl: acl.value,
    });
    revealKey.value = res.apiKey;
    createdId.value = res.buddy.id;
  } finally {
    submitting.value = false;
  }
}

function onKeyDismiss() {
  const id = createdId.value;
  revealKey.value = null;
  createdId.value = null;
  if (id) router.push({ name: "buddy-detail", params: { id } });
  else router.push({ name: "buddies" });
}
</script>

<template>
  <NCard title="Register a buddy">
    <NForm v-if="!revealKey" label-placement="top">
      <NFormItem label="Name">
        <NInput v-model:value="name" data-test="name" placeholder="Huginn" />
      </NFormItem>
      <NFormItem label="Description">
        <NInput
          v-model:value="description"
          data-test="description"
          type="textarea"
          placeholder="What this buddy knows"
        />
      </NFormItem>
      <NFormItem label="Access control">
        <AclEditor v-model="acl" />
      </NFormItem>
      <NSpace>
        <NButton data-test="submit" type="primary" :disabled="!canSubmit" @click="submit">
          Create
        </NButton>
        <NButton @click="router.push({ name: 'buddies' })">Cancel</NButton>
      </NSpace>
    </NForm>
    <ApiKeyReveal v-else :api-key="revealKey" :on-dismiss="onKeyDismiss" />
  </NCard>
</template>
