<template>
  <v-card
    outlined
    class="clickable-card pro-card"
    @click="$router.push('/pro')"
  >
    <v-card-title>
      <span>Upgrade to <span class="pro-highlight">Pro</span></span>
    </v-card-title>
    <v-card-text>
      <p>Unlock hundreds of high-quality practice questions and powerful study tools to help you pass your BC Real Estate Licensing Exam on the first try!</p>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { useRouter } from "vue-router";

const router = useRouter();
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
}

.pro-highlight {
  color: #1976D2;
  font-weight: bold;
  text-decoration: underline;
}
</style>