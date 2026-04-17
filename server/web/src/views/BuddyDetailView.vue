<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NCard, NSpace, NButton, NDescriptions, NDescriptionsItem, NInput, NPopconfirm } from "naive-ui";
import ApiKeyReveal from "@/components/ApiKeyReveal.vue";
import AclEditor from "@/components/AclEditor.vue";
import { useBuddiesStore } from "@/stores/buddies";
import { useAuthStore } from "@/stores/auth";
import type { Acl } from "@/types";

const route = useRoute();
const router = useRouter();
const store = useBuddiesStore();
const auth = useAuthStore();

const id = computed(() => String(route.params.id));
const buddy = computed(() => store.list.find((b) => b.id === id.value));

const revealKey = ref<string | null>(null);
const editing = ref(false);
const draftDesc = ref("");
const draftAcl = ref<Acl>({ mode: "public" });

onMounted(async () => {
  if (!store.loaded) await store.fetchAll();
  if (buddy.value) {
    draftDesc.value = buddy.value.description;
    draftAcl.value = buddy.value.acl;
  }
});

const canManage = computed(
  () => auth.hasRole("admin") || (!!buddy.value && buddy.value.ownerEmail === auth.me?.email),
);

async function rotate() {
  if (!buddy.value) return;
  revealKey.value = await store.rotateKey(buddy.value.id);
}

async function remove() {
  if (!buddy.value) return;
  await store.remove(buddy.value.id);
  router.push({ name: "buddies" });
}

async function save() {
  if (!buddy.value) return;
  await store.update(buddy.value.id, { description: draftDesc.value, acl: draftAcl.value });
  editing.value = false;
}
</script>

<template>
  <div v-if="!buddy">Loading…</div>
  <NCard v-else :title="buddy.name">
    <NDescriptions bordered :column="1">
      <NDescriptionsItem label="Description">
        <span v-if="!editing">{{ buddy.description }}</span>
        <NInput v-else v-model:value="draftDesc" type="textarea" />
      </NDescriptionsItem>
      <NDescriptionsItem label="Owner">{{ buddy.ownerEmail }}</NDescriptionsItem>
      <NDescriptionsItem label="ACL">
        <span v-if="!editing">{{ buddy.acl.mode }}</span>
        <AclEditor v-else v-model="draftAcl" />
      </NDescriptionsItem>
      <NDescriptionsItem label="Online">{{ buddy.online ? "yes" : "no" }}</NDescriptionsItem>
    </NDescriptions>

    <NSpace v-if="canManage && !revealKey" style="margin-top: 16px">
      <NButton v-if="!editing" @click="editing = true">Edit</NButton>
      <NButton v-if="editing" type="primary" @click="save">Save</NButton>
      <NButton v-if="editing" @click="editing = false">Cancel</NButton>
      <NButton data-test="rotate" @click="rotate">Rotate key</NButton>
      <NPopconfirm @positive-click="remove">
        <template #trigger><NButton data-test="delete" type="error">Delete</NButton></template>
        Delete this buddy? This cannot be undone.
      </NPopconfirm>
    </NSpace>

    <div v-if="revealKey" style="margin-top: 16px">
      <ApiKeyReveal :api-key="revealKey" :on-dismiss="() => (revealKey = null)" />
    </div>
  </NCard>
</template>
