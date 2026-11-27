<template>
  <v-app>
    <div class="app-container">
      <NavBar />
      <RateLimitBanner :show="rateLimitBanner" />
      <GlobalSnackbar />
      <v-main class="main-content">
        <router-view />
      </v-main>
      <Footer class="footer" />
    </div>
  </v-app>
</template>

<script setup>
import { onMounted } from 'vue';
import NavBar from './components/nav.vue';
import Footer from './components/footer.vue';
import RateLimitBanner from './components/RateLimitBanner.vue';
import GlobalSnackbar from './components/GlobalSnackbar.vue';
import { rateLimitBanner } from './composables/useRateLimitBanner';
import { initPreload } from './composables/usePreload';

onMounted(() => {
  initPreload();
});
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

/* v-footer defaults to flex-grow; keep it at its content height so it never clips its links */
.footer {
  flex: 0 0 auto;
}
</style>

<style>
/*
 * Scale the UI up on 2K-4K screens. Up to 1920px wide nothing changes (1rem = 16px). Above it the
 * root font-size grows to ~18.7px at 2560px and caps at 24px from 3840px, so everything sized in rem
 * grows with it. The app bar height in nav.vue follows the same curve.
 */
@media (min-width: 1920px) {
  :root {
    font-size: clamp(100%, 50% + 100vw / 240, 150%);
  }

  /* Vuetify widens containers to 1800-2400px; size them in rem so the layout scales instead of stretching */
  :root .v-container:not(.v-container--fluid) {
    max-width: 112.5rem;
  }

  /* Vuetify sizes these controls in px; restate its defaults in rem so they grow with the text */
  :root .v-btn--size-small {
    --v-btn-height: 1.75rem;
  }

  :root .v-btn--size-default {
    --v-btn-height: 2.25rem;
  }

  :root .v-btn--size-large {
    --v-btn-height: 2.75rem;
  }

  :root .v-selection-control--density-default {
    --v-selection-control-size: 2.5rem;
  }

  :root .v-field {
    font-size: 1rem;
  }

  :root .v-input--density-default .v-field--variant-filled {
    --v-input-control-height: 3.5rem;
  }
}
</style>
