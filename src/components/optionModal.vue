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
        <v-radio-group
          v-if="isPro && contentStatus.aiQuestionsServed"
          v-model="options.questionSource"
          label="Question source"
          color="primary"
          class="mt-4"
          hint="AI questions are written by AI and reviewed before they are published."
          persistent-hint
        >
          <v-radio label="Mixed (human + AI)" value="mixed"></v-radio>
          <v-radio label="Human only" value="human"></v-radio>
          <v-radio label="AI only" value="ai"></v-radio>
        </v-radio-group>
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
import { storeToRefs } from "pinia";
import useOptions from "../composables/useOption";
import { useAuthStore } from "../composables/useAuth";
import { contentStatus } from "../composables/useContentStatus";

const dialog = ref(false);
const { options } = useOptions();
const { isPro } = storeToRefs(useAuthStore());

function Close() {
  dialog.value = false;
}

defineExpose({ open: () => (dialog.value = true) });
</script>
