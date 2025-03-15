<template>
  <v-container>
    <v-row class="text-center">
      <v-col cols="12">
        <v-select
          :items="chapters"
          label="Select Chapter"
          v-model="selectedChapter"
          class="mb-4"
        />
        <h2>Quiz Questions (Chapter {{ selectedChapter }})</h2>
        <div v-if="questions.length">
          <div v-for="q in questions" :key="q.id" class="mb-4">
            <p>Q{{ q.questionNumber }}: {{ q.question }}</p>
            <ul>
              <li v-for="(choice, index) in q.choices" :key="index">
                {{ choice }}
              </li>
            </ul>
          </div>
        </div>
        <div v-else>
          Loading...
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch } from "vue";
import { fetchQuestionsByChapter } from "../composables/useQuestion";

const chapters = [1, 2, 3, 4];
const selectedChapter = ref(1);
const questions = ref([]);

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(selectedChapter.value);
    questions.value = result;
    console.log("Loaded questions:", questions.value);
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

watch(selectedChapter, () => {
  loadQuestions();
});

loadQuestions();
</script>
