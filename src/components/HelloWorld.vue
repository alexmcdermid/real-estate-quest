<template>
  <v-container>
    <v-row class="text-center">
      <v-col cols="12">
        <h2>Quiz Questions</h2>
        <div v-if="questions.length">
          <div v-for="q in questions" :key="q.id" class="mb-4">
            <p>Q{{ q.questionNumber }}: {{ q.question }}</p>
            <ul>
              <li v-for="(choice, index) in q.choices" :key="index">
                {{ choice }}
              </li>
            </ul>
          </div>
          <button @click="loadQuestions">Reload Questions</button>
        </div>
        <div v-else>
          Loading...
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref } from "vue";
import { fetchQuestionsByChapter } from "../composables/useQuestion";

const questions = ref([]);

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(1);
    questions.value = result;
    console.log("Loaded questions:", questions.value);
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

loadQuestions();
</script>
