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
          class="mb-6"
        />
      </v-col>
      <v-col cols="12">
        <h2 class="mb-4">Quiz Questions (Chapter {{ selectedChapter }})</h2>
        <v-row>
          <v-col
            v-for="q in questions"
            :key="q.id"
            cols="12"
            md="6"
          >
            <QuestionCard :question="q" :shuffled="shuffled"/>
          </v-col>
        </v-row>
        <div v-if="isLoading">
          Loading...
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { useAuth } from "../composables/useAuth";
import { fetchQuestionsByChapter } from "../composables/useQuestion";
import QuestionCard from "./questionCard.vue";
const { authInitialized } = useAuth();

const isLoading = ref(true);
const chapters = [1, 2];
const selectedChapter = ref(1);
const questions = ref([]);
const shuffled = ref(true);

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(selectedChapter.value);
    questions.value = shuffled.value ? shuffleArray(result) : result;
    isLoading.value = false;
    console.log("Loaded questions:", questions.value);
  } catch (error) {
    isLoading.value = false;
    console.error("Error loading questions:", error);
  }
}

watch(selectedChapter, () => {
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
