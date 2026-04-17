<script setup lang="ts">
import { NCard, NButton, NSpace } from "naive-ui";
import { useRoute } from "vue-router";
import { startLogin } from "@/lib/auth";

const route = useRoute();
function onLogin() {
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
  startLogin(redirect);
}
</script>

<template>
  <div style="display:flex; align-items:center; justify-content:center; height:100vh">
    <NCard title="Clawgard" style="max-width: 360px">
      <NSpace vertical size="large">
        <span>Sign in with your organization's identity provider.</span>
        <NButton type="primary" block @click="onLogin">Log in</NButton>
      </NSpace>
    </NCard>
  </div>
</template>
