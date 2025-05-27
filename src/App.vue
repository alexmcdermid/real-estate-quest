<template>
  <v-app>
    <div class="app-container">
      <NavBar />
      <RateLimitBanner :show="rateLimitBanner" />
      <v-main class="main-content">
        <router-view />
      </v-main>
      <Footer class="footer" />
    </div>
  </v-app>
</template>

<script setup>
import NavBar from './components/nav.vue';
import Footer from './components/footer.vue';
import RateLimitBanner from './components/RateLimitBanner.vue';
import { rateLimitBanner } from './composables/useRateLimitBanner';
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  flex: 1;
}

.footer {
  max-height: 85px;
}
</style>
