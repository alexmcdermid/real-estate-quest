<template>
  <v-container>
    <v-row class="text-center">
      <v-col cols="12">
        <h2>Quiz Question</h2>
        <div v-if="question">
          <p>Q{{ question.questionNumber }}: {{ question.questionText }}</p>
          <ul>
            <li v-for="(choice, index) in question.choices" :key="index">
              {{ choice }}
            </li>
          </ul>
          <button @click="loadNextQuestion">Next Question</button>
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
import { fetchNextQuestion } from "../composables/useQuestion";

const question = ref(null);

async function loadNextQuestion() {
  try {
    question.value = await fetchNextQuestion(1);
    console.log("Loaded question:", question.value);
  } catch (error) {
    console.error("Error loading question:", error);
  }
}

loadNextQuestion();
</script>
