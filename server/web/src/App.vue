<script setup lang="ts">
// Dark theme locked for MVP; toggle is a v2 feature.
import { NConfigProvider, darkTheme } from "naive-ui";
</script>

<template>
  <NConfigProvider :theme="darkTheme">
    <router-view />
  </NConfigProvider>
</template>
