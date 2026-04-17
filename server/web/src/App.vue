<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { NConfigProvider, darkTheme, NMessageProvider, NDialogProvider } from "naive-ui";
import AppShell from "@/components/AppShell.vue";

// Dark theme locked for MVP; toggle is a v2 feature.
const route = useRoute();
const needsShell = computed(() => !["login", "auth-callback", "forbidden"].includes(String(route.name)));
</script>

<template>
  <NConfigProvider :theme="darkTheme">
    <NMessageProvider>
      <NDialogProvider>
        <AppShell v-if="needsShell">
          <router-view />
        </AppShell>
        <router-view v-else />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
