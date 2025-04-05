<template>
  <v-container>
    <v-row>
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
        <h2 class="mb-4">Quiz Questions (Chapter {{ selectedChapter }})</h2>
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
              />
            </v-col>
          </template>
          <template v-else>
            <v-col
              v-for="q in questions"
              :key="q.id"
              cols="12"
              md="6"
            >
              <QuestionCard :question="q" :shuffled="shuffled"/>
            </v-col>
          </template>
        </v-row>
        <div v-if="!isLoading && questions.length == 0" class="mt-4">
          <ProCard />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { useAuth } from "../composables/useAuth";
import { fetchQuestionsByChapter } from "../composables/useQuestion";
import QuestionCard from "./questionCard.vue";
import ProCard from "./proCard.vue";
import useOptions from "../composables/useOption";
import { chapters } from "@/constants/chapters";
const { authInitialized } = useAuth();
const { options } = useOptions();

const isLoading = ref(true);
const selectedChapter = ref(1);
const questions = ref([]);
const shuffled = computed(() => options.shuffled);

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(selectedChapter.value);
    questions.value = shuffled.value ? shuffleArray([...result]) : result;
    isLoading.value = false;
    console.log("Loaded questions:", questions.value);
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
  let currentIndex = array.length, randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}

</script>
