<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title class="headline">Quiz Options</v-card-title>
      <v-card-text>
        <v-switch
          v-model="options.shuffled"
          :label="`Randomly Order Questions and Flashcards: ${options.shuffled}`"
          color="primary"
          hide-details
        ></v-switch>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="Close">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref } from "vue";
import useOptions from "../composables/useOption";

const dialog = ref(false);
const { options } = useOptions();

function Close() {
  dialog.value = false;
}

defineExpose({ open: () => (dialog.value = true) });
</script>
