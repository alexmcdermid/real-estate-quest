<template>
  <v-container>
    <v-row>
      <v-col cols="12" class="d-flex align-items-center justify-space-between">
        <h2>Quiz Questions (Chapter {{ selectedChapter }})</h2>
        <v-btn
          v-if="hasCompletedQuestions"
          color="error"
          outlined
          @click="resetAllQuestions"
        >
          Reset All
        </v-btn>
      </v-col>
      <v-col cols="12">
        <v-select
          :items="chapters"
          label="Select Chapter"
          v-model="selectedChapter"
          outlined
          dense
          class="mb-4"
        />
      </v-col>
      <v-col cols="12">
        <v-row>
          <template v-if="isLoading">
            <v-col
              v-for="n in 4"
              :key="n"
              cols="12"
              md="6"
            >
              <v-skeleton-loader
                type="card, article, actions"
                elevation="11"
              />
            </v-col>
          </template>
          <template v-else>
            <v-col
              v-for="(item, index) in questionsWithProCard"
              :key="index"
              cols="12"
              md="6"
            >
              <component
                :is="item.component"
                v-bind="item.props"
                @questionCompleted="markQuestionCompleted(index)"
                @questionReset="markQuestionReset(index)"
              />
            </v-col>
          </template>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { useAuthStore } from "../composables/useAuth";
import { storeToRefs } from "pinia";

import { fetchQuestionsByChapter } from "../composables/useQuestion";
import QuestionCard from "./questionCard.vue";
import ProCard from "./proCard.vue";
import useOptions from "../composables/useOption";
import { chapters } from "@/constants/chapters";

const authStore = useAuthStore();
const { authInitialized } = storeToRefs(authStore);

const { options } = useOptions();

const isLoading = ref(true);
const selectedChapter = ref(1);
const questions = ref([]);
const completedQuestions = ref(new Set());
const shuffled = computed(() => options.shuffled);
const resetAll = ref(false);

const questionsWithProCard = computed(() => {
  const questionItems = questions.value.map((q, index) => ({
    component: QuestionCard,
    props: {
      question: q,
      shuffled: shuffled.value,
      questionIndex: index,
      resetAll: resetAll.value,
    },
  }));

  if (questions.value.length < 10) {
    const middleIndex = Math.floor(questionItems.length / 2);
    questionItems.splice(middleIndex, 0, {
      component: ProCard,
      props: {},
    });
  }

  return questionItems;
});

const hasCompletedQuestions = computed(() => completedQuestions.value.size > 0);

function markQuestionCompleted(index) {
  completedQuestions.value.add(index);
}

function markQuestionReset(index) {
  completedQuestions.value.delete(index);
}

function resetAllQuestions() {
  resetAll.value = true;
  setTimeout(() => {
    resetAll.value = false;
  }, 0);
}

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(selectedChapter.value);
    questions.value = shuffled.value ? shuffleArray([...result]) : result;
    isLoading.value = false;
  } catch (error) {
    isLoading.value = false;
    console.error("Error loading questions:", error);
  }
}

watch(selectedChapter, () => {
  isLoading.value = true;
  loadQuestions();
});

watch(shuffled, () => {
  isLoading.value = true;
  loadQuestions();
});

onMounted(() => {
  if (authInitialized.value) {
    loadQuestions();
  } else {
    const stopWatch = watch(authInitialized, (newVal) => {
      if (newVal === true) {
        loadQuestions();
        stopWatch();
      }
    });
  }
});

function shuffleArray(array) {
  let currentIndex = array.length,
    randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}
</script>
