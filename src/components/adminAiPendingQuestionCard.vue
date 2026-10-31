<template>
  <v-card elevation="2">
    <v-card-title class="text-h6 text-wrap">
      Chapter {{ pendingQuestion.chapter }}: {{ chapterName }}
    </v-card-title>
    <v-card-subtitle class="text-wrap">
      Generated {{ generatedAtText }} ({{ pendingQuestion.trigger }} run) · <code>{{ pendingQuestion.id }}</code>
    </v-card-subtitle>
    <v-card-text>
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
      <v-switch
        v-model="draft.premium"
        :label="draft.premium ? 'Premium (Pro members only)' : 'Free for everyone'"
        color="primary"
        hide-details
      ></v-switch>
      <p v-if="chapterSplitText" class="text-caption">{{ chapterSplitText }}</p>
    </v-card-text>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn
        color="error"
        variant="outlined"
        :loading="isRejecting"
        :disabled="isApproving || isRejecting"
        @click="isRejectDialogOpen = true"
      >
        Reject
      </v-btn>
      <v-btn
        color="success"
        variant="flat"
        :loading="isApproving"
        :disabled="isApproving || isRejecting"
        @click="approve"
      >
        Approve
      </v-btn>
    </v-card-actions>

    <v-dialog v-model="isRejectDialogOpen" max-width="500">
      <v-card>
        <v-card-title>Reject this question?</v-card-title>
        <v-card-text>
          <p class="mb-4">Rejected questions are kept so the generator avoids their topics.</p>
          <v-textarea
            v-model="rejectionReason"
            label="Reason (optional)"
            rows="2"
            auto-grow
            counter="500"
            maxlength="500"
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isRejectDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="reject">Reject</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useAdminStore } from '@/composables/useAdmin';
import { chapters } from '@/constants/chapters';

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

// The reviewer edits a copy. Premium is the default, like most human questions.
const draft = reactive({
  question: props.pendingQuestion.question,
  choices: [...props.pendingQuestion.choices],
  correctChoice: props.pendingQuestion.correctChoice,
  explanation: props.pendingQuestion.explanation,
  premium: true,
});

const isApproving = ref(false);
const isRejecting = ref(false);
const isRejectDialogOpen = ref(false);
const rejectionReason = ref('');

const chapterName = computed(() => chapters.find((chapter) => chapter.id === props.pendingQuestion.chapter)?.name || '');

const generatedAtText = computed(() => (
  props.pendingQuestion.generatedAt ? new Date(props.pendingQuestion.generatedAt).toLocaleString() : '-'
));

// Same rule as the server's validation, which trims the explanation first
const expectedExplanationStart = computed(() => `Correct Answer: ${draft.correctChoice + 1}`);
const explanationMatchesCorrectChoice = computed(() => draft.explanation.trim().startsWith(expectedExplanationStart.value));

const chapterSplitText = computed(() => {
  if (!props.chapterSplit) return '';
  const { humanTotal, humanFree, aiTotal, aiFree } = props.chapterSplit;
  return `Chapter ${props.pendingQuestion.chapter} today: ${humanFree} of ${humanTotal} human questions free`
    + ` · ${aiFree} of ${aiTotal} AI questions free`;
});

async function approve() {
  isApproving.value = true;
  try {
    // On success the store drops the question from the queue, which removes this card
    await adminStore.approveAiQuestion({
      pendingQuestionId: props.pendingQuestion.id,
      editedQuestion: {
        question: draft.question,
        choices: [...draft.choices],
        correctChoice: draft.correctChoice,
        explanation: draft.explanation,
      },
      premium: draft.premium,
    });
  } catch {
    // The store already showed the error; the draft stays for another try
  } finally {
    isApproving.value = false;
  }
}

async function reject() {
  isRejectDialogOpen.value = false;
  isRejecting.value = true;
  try {
    await adminStore.rejectAiQuestion({
      pendingQuestionId: props.pendingQuestion.id,
      rejectionReason: rejectionReason.value,
    });
  } catch {
    // The store already showed the error
  } finally {
    isRejecting.value = false;
  }
}
</script>
