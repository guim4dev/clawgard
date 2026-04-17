<script setup lang="ts">
/*
 * The server returns a generated API key exactly once (in CreateBuddyResponse
 * or in the rotate-key response). The parent is responsible for unmounting
 * this component after onDismiss fires and NEVER persisting the key. Do not
 * store the key in any Pinia state that outlives this component.
 */
import { ref } from "vue";
import { NAlert, NCode, NButton, NCheckbox, NSpace } from "naive-ui";

defineProps<{ apiKey: string; onDismiss: () => void }>();

const confirmed = ref(false);

async function copy(key: string) {
  await navigator.clipboard.writeText(key);
}
</script>

<template>
  <NAlert type="warning" title="Save this key — you will not see it again">
    <NSpace vertical size="small">
      <NCode :code="apiKey" language="text" />
      <NSpace>
        <NButton data-test="copy" size="small" @click="copy(apiKey)">Copy</NButton>
      </NSpace>
      <NCheckbox
        data-test="confirm-saved"
        v-model:checked="confirmed"
      >
        I have saved the key in a secure location.
      </NCheckbox>
      <NButton
        data-test="dismiss"
        type="primary"
        :disabled="!confirmed"
        @click="onDismiss"
      >
        Dismiss
      </NButton>
    </NSpace>
  </NAlert>
</template>
