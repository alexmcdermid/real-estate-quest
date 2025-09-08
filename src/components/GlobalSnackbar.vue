<template>
  <v-snackbar v-model="notifier.show" :color="notifier.color" :timeout="notifier.timeout" location="top" multi-line>
    {{ notifier.message }}
    <template #actions>
      <v-btn text @click="notifier.show = false">Close</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import { useNotifier } from '@/composables/useNotifier';
const { notifier } = useNotifier();
</script>
