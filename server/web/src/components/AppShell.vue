<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NLayout, NLayoutSider, NLayoutContent, NLayoutHeader, NMenu, NText, NButton } from "naive-ui";
import { useAuthStore } from "@/stores/auth";
import type { MenuOption } from "naive-ui";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const menuOptions = computed<MenuOption[]>(() => {
  const opts: MenuOption[] = [
    { label: "Buddy directory", key: "buddies" },
    { label: "Thread audit", key: "threads" },
  ];
  if (auth.hasRole("admin")) {
    opts.splice(1, 0, { label: "New buddy", key: "buddy-create" });
  }
  return opts;
});

function onSelect(key: string) {
  router.push({ name: key });
}

async function onLogout() {
  await auth.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <NLayout has-sider style="height: 100vh">
    <NLayoutSider bordered :width="220">
      <div style="padding: 16px; font-weight: 600">Clawgard</div>
      <NMenu
        :value="String(route.name ?? '')"
        :options="menuOptions"
        @update:value="onSelect"
      />
    </NLayoutSider>
    <NLayout>
      <NLayoutHeader bordered style="padding: 8px 16px; display:flex; justify-content: space-between; align-items: center">
        <NText depth="3">{{ auth.me?.email }}</NText>
        <NButton size="small" @click="onLogout">Log out</NButton>
      </NLayoutHeader>
      <NLayoutContent content-style="padding: 24px">
        <slot />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
