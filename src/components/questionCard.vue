<template>
  <v-card outlined class="mb-4" :data-question-index="questionIndex">
    <v-card-title v-if="!shuffled" class="preformatted">
      Question {{ question.questionNumber }}
    </v-card-title>
    <!-- Display shared question text if provided -->
    <v-card-subtitle v-if="sharedText">
      <span v-html="formattedSharedText"></span>
    </v-card-subtitle>
    <v-card-text>
      <span class="questionText" v-html="formattedQuestion"></span>
    </v-card-text>
    <v-card-text>
      <v-radio-group v-model="selectedChoice" mandatory :disabled="submitted">
        <v-radio
          v-for="(choice, index) in question.choices"
          :key="index"
          :value="index"
          :label="`${index + 1}. ${choice}`"
          :color="getChoiceColor(index)"
          class="radio-wrap"
        />
      </v-radio-group>
      <v-btn
        v-if="!submitted"
        color="primary"
        @click="submitAnswer"
        :disabled="selectedChoice === null"
        class="mt-4"
        block
      >
        Submit Answer
      </v-btn>
      <div v-else class="mt-4">
        <v-alert :type="isCorrect ? 'success' : 'error'" border="start" elevation="2">
          <div class="alert-content">
            <span>
              {{ isCorrect ? 'Correct!' : 'Incorrect.' }}
            </span>
            <v-btn
              outlined
              size="small"      
              color="black"
              class="reset-btn"
              @click="resetQuestion"
            >
              Reset
            </v-btn>
          </div>
        </v-alert>
        <p class="mt-2">
          <strong>Explanation: </strong><span v-html="formattedExplanation"></span>
        </p>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  question: {
    type: Object,
    required: true,
  },
  shuffled: {
    type: Boolean,
    required: true,
  },
  questionIndex: {
    type: Number,
    required: true,
  },
  resetAll: {
    type: Boolean,
    required: true,
  },
});

// Define emits for events
const emit = defineEmits(["questionCompleted", "questionReset"]);

// Local state for selected answer and submission state.
const selectedChoice = ref(null);
const submitted = ref(false);

// Compute whether the answer is correct.
const isCorrect = computed(() => submitted.value && selectedChoice.value === props.question.correctChoice);

// Optional shared question text.
const sharedText = computed(() => props.question.sharedQuestionText || null);

// Watch for resetAll prop changes
watch(() => props.resetAll, (newVal) => {
  if (newVal) {
    resetQuestion();
  }
});

// Submit the answer.
function submitAnswer() {
  const correct = selectedChoice.value === props.question.correctChoice;
  submitted.value = true;
  emit("questionCompleted", {
    index: props.questionIndex,
    isCorrect: correct,
    selectedChoice: selectedChoice.value,
  });
}

// Reset the question.
function resetQuestion() {
  selectedChoice.value = null;
  submitted.value = false;
  emit("questionReset", props.questionIndex);
}

// Format line breaks and bold text in question text.
const formattedQuestion = computed(() => {
  return props.question.question
    .replace(/\n/g, '<br><br>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
});

const formattedSharedText = computed(() => {
  return sharedText.value
    ? sharedText.value.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    : '';
});

const formattedExplanation = computed(() => {
  return props.question.explanation.replace(/\*\*(.*?)\*\*/g, '<i><b>$1</b></i>');
});

// Return the color for each answer button based on submission status.
function getChoiceColor(index) {
  if (!submitted.value) return 'primary';
  if (index === props.question.correctChoice) return 'success';
  if (selectedChoice.value === index && index !== props.question.correctChoice) return 'error';
  return 'primary';
}

watch(() => submitted.value, (newVal) => {
  if (!newVal) {
    emit("questionReset", props.questionIndex);
  }
});
</script>

<style scoped>
.questionText {
  font-size: 16px;
}
.preformatted {
  white-space: pre-wrap;
  word-break: break-word;
}
.radio-wrap .v-label {
  white-space: pre-wrap;
  word-break: break-word;
}
.radio-wrap {
  display: flex;
  align-items: flex-start !important;
  margin-top: 3%;
}
.alert-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.reset-btn {
  margin-left: auto;
}
</style>
