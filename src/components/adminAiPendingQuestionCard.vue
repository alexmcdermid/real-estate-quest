<template>
  <AdminAiPendingReviewCard
    :pendingItem="pendingQuestion"
    :chapterSplit="chapterSplit"
    itemLabel="question"
    :approvePendingItem="approve"
    :rejectPendingItem="reject"
  >
    <v-textarea v-model="draft.question" label="Question" rows="2" auto-grow density="compact"></v-textarea>
    <v-text-field
      v-for="(choice, choiceIndex) in draft.choices"
      :key="choiceIndex"
      v-model="draft.choices[choiceIndex]"
      :label="`Choice ${choiceIndex + 1}`"
      density="compact"
    ></v-text-field>
    <v-radio-group v-model="draft.correctChoice" label="Correct choice" color="primary" inline hide-details>
      <v-radio
        v-for="choiceNumber in draft.choices.length"
        :key="choiceNumber"
        :label="String(choiceNumber)"
        :value="choiceNumber - 1"
      ></v-radio>
    </v-radio-group>
    <v-textarea v-model="draft.explanation" label="Explanation" rows="3" auto-grow density="compact" class="mt-4"></v-textarea>
    <v-alert v-if="!explanationMatchesCorrectChoice" type="warning" variant="tonal" density="compact" class="mb-4">
      The explanation should start with "{{ expectedExplanationStart }}".
    </v-alert>
  </AdminAiPendingReviewCard>
</template>

<script setup>
import { reactive, computed } from 'vue';
import { useAdminStore } from '@/composables/useAdmin';
import AdminAiPendingReviewCard from './adminAiPendingReviewCard.vue';

const props = defineProps({
  pendingQuestion: {
    type: Object,
    required: true,
  },
  // { humanTotal, humanFree, aiTotal, aiFree } for the question's chapter
  chapterSplit: {
    type: Object,
    default: null,
  },
});

const adminStore = useAdminStore();

// The reviewer edits a copy
const draft = reactive({
  question: props.pendingQuestion.question,
  choices: [...props.pendingQuestion.choices],
  correctChoice: props.pendingQuestion.correctChoice,
  explanation: props.pendingQuestion.explanation,
});

// Same rule as the server's validation, which trims the explanation first
const expectedExplanationStart = computed(() => `Correct Answer: ${draft.correctChoice + 1}`);
const explanationMatchesCorrectChoice = computed(() => draft.explanation.trim().startsWith(expectedExplanationStart.value));

function approve({ premium }) {
  return adminStore.approveAiQuestion({
    pendingQuestionId: props.pendingQuestion.id,
    editedQuestion: {
      question: draft.question,
      choices: [...draft.choices],
      correctChoice: draft.correctChoice,
      explanation: draft.explanation,
    },
    premium,
  });
}

function reject({ rejectionReason }) {
  return adminStore.rejectAiQuestion({
    pendingQuestionId: props.pendingQuestion.id,
    rejectionReason,
  });
}
</script>
