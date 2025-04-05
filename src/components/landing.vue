<template>
  <v-container>
    <h1>Welcome to Real Estate Quest</h1>
    <p>Discover the ultimate platform for real estate learning and quizzes.</p>
    <v-btn color="secondary" @click="navigateToQuestions">Explore Questions</v-btn>
  </v-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();

function navigateToQuestions() {
  router.push('/questions');
}
</script>