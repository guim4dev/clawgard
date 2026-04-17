<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

onMounted(async () => {
  auth.$patch({ loaded: false });
  await auth.ensureLoaded();
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/buddies";
  router.replace(redirect);
});
</script>

<template>
  <div>Signing you in…</div>
</template>
