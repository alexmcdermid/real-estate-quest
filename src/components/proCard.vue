<template>
  <v-card outlined class="mb-4 pro-card clickable-card" @click="$router.push('/pro')">
    <!-- Title Section -->
    <v-card-title class="preformatted">
      Unlock Pro Features
    </v-card-title>
    <!-- Description Section -->
    <v-card-text class="pb-0">
      <span class="questionText">
        Upgrade to <span class="pro-highlight">Pro</span> to access hundreds of high-quality practice {{ proType === 'flashcards' ? 'flashcards' : 'questions' }}, detailed explanations, and powerful study tools to help you pass your BC Real Estate Licensing Exam on the first try!
      </span>
    </v-card-text>
    <!-- Call-to-Action Section -->
    <v-card-text>
      <v-btn
        color="primary"
        block
      >
        Learn More
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { useRouter } from "vue-router";
const router = useRouter();
const props = defineProps({
  proType: {
    type: String,
    default: 'questions',
  },
});
</script>

<style scoped>
.clickable-card {
  cursor: pointer;
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}

.clickable-card:hover {
  transform: translateY(-2px);
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.2);
}

.pro-card {
  border-color: #1976D2;
  min-height: 210px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.pro-highlight {
  color: #1976D2;
  font-weight: bold;
  text-decoration: underline;
}

.questionText {
  font-size: 16px;
}

.preformatted {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>