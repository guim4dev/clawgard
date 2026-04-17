<script setup lang="ts">
import { NResult, NButton } from "naive-ui";
import { useRouter } from "vue-router";
const router = useRouter();
</script>
<template>
  <NResult status="403" title="Forbidden" description="You are not allowed to view that page.">
    <template #footer>
      <NButton @click="router.push('/buddies')">Back to directory</NButton>
    </template>
  </NResult>
</template>
