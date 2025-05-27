<template>
  <v-alert
    v-if="show"
    type="warning"
    prominent
    class="rate-limit-banner"
    icon="mdi-alert"
    dismissible
    @input="show = false"
  >
    <slot>
      Too many requests – please try again in a minute.<br>
      <span v-if="remaining > 0">You can try again in {{ remaining }} second<span v-if="remaining !== 1">s</span>.</span>
    </slot>
  </v-alert>
</template>

<script setup>
import { ref, watch, watchEffect, onUnmounted, nextTick } from 'vue';
const props = defineProps({
  show: Boolean,
  onRetry: Function
});
const show = ref(props.show);
const remaining = ref(0);
let timer = null;
let hideTimeout = null;

watch(() => props.show, (val) => {
  show.value = val;
  if (val) {
    remaining.value = 60;
    clearInterval(timer);
    clearTimeout(hideTimeout);
    timer = setInterval(() => {
      if (remaining.value > 0) {
        remaining.value--;
      }
    }, 1000);
    hideTimeout = setTimeout(async () => {
      clearInterval(timer);
      show.value = false;
    }, 60000);
  } else {
    clearInterval(timer);
    clearTimeout(hideTimeout);
  }
});

onUnmounted(() => {
  clearInterval(timer);
  clearTimeout(hideTimeout);
});
</script>

<style scoped>
.rate-limit-banner {
  z-index: 9999;
  position: sticky;
  top: 0;
  left: 0;
  width: 100%;
  max-height: 80px;
}
.v-alert.rate-limit-banner .v-alert__content {
  padding: 0 !important;
  margin: 0 !important;
}
</style>
