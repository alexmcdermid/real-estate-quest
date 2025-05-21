<template>
  <v-container>
    <v-row>
      <v-col cols="12" class="d-flex flex-column flex-md-row align-items-center justify-space-around justify-md-space-between">
        <h2 class="mb-2 mb-md-0 text-center text-md-start mx-auto mx-md-0">Quiz Questions - Chapter {{ selectedChapter }}</h2>
        <div v-if="hasCompletedQuestions" class="d-flex align-items-center align-self-center w-100 w-md-auto justify-center justify-md-start">
          <span class="question-counter">Answered: {{ completedQuestions.size }} / {{ questions.length }}</span>
          <v-btn
            color="error"
            outlined
            @click="resetAllQuestions"
          >
            Reset All
          </v-btn>
        </div>
      </v-col>
      <v-col cols="12">
        <v-select
          :items="chapters"
          label="Select Chapter"
          v-model="selectedChapter"
          outlined
          dense
          class="mb-4"
          :item-title="item => `${item.id} - ${item.name}`"
          :item-value="item => item.id"
          :return-object="false"
          :value="1"
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
                proType="questions"
                @questionCompleted="markQuestionCompleted(index)"
                @questionReset="markQuestionReset(index)"
              />
            </v-col>
            <v-col 
            v-if="questions.length == 0"
            cols="12"
            md="6"
            >
              <v-card>
                <v-card-title class="preformatted text-center">
                  No questions available for this chapter.
                </v-card-title>
                <v-card-text class="text-center">
                  Content coming soon, please check back later.
                </v-card-text>
              </v-card>
            </v-col>
          </template>
        </v-row>
      </v-col>
      <v-col cols="12" class="d-flex align-items-center justify-space-around justify-md-end">
        <div v-if="hasCompletedQuestions" class="d-flex align-items-center">
          <span class="question-counter">Answered: {{ completedQuestions.size }} / {{ questions.length }}</span>
          <v-btn
            color="error"
            outlined
            @click="resetAllQuestions"
          >
            Reset All
          </v-btn>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { useAuthStore } from "../composables/useAuth";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";

import { fetchQuestionsByChapter } from "../composables/useQuestion";
import QuestionCard from "./questionCard.vue";
import ProCard from "./proCard.vue";
import useOptions from "../composables/useOption";
import { chapters } from "@/constants/chapters";

const authStore = useAuthStore();
const { authInitialized, isPro } = storeToRefs(authStore);

const { options } = useOptions();

const isLoading = ref(true);
const selectedChapter = ref(1);
const questions = ref([]);
const completedQuestions = ref(new Set());
const shuffled = computed(() => options.shuffled);
const resetAll = ref(false);

const route = useRoute();
const router = useRouter();

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

  if (!isPro.value) {
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
  completedQuestions.value = new Set();
  loadQuestions();
});

watch(shuffled, () => {
  isLoading.value = true;
  loadQuestions();
});

onMounted(() => {
  // Check for ch query param on mount
  const chParam = parseInt(route.query.ch);
  if (!isNaN(chParam) && chapters.some(c => c.id === chParam)) {
    selectedChapter.value = chParam;
    // Remove ch param from URL after using it
    const { ch, ...rest } = route.query;
    router.replace({ query: { ...rest } });
  }
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

<style scoped>
.preformatted {
  white-space: pre-wrap;
  word-break: break-word;
}
.question-counter {
  font-weight: 500;
  margin-right: 8px;
  display: flex;
  align-items: center;
}
</style>
