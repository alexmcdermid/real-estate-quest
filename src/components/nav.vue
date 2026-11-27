<template>
  <v-app-bar app flat color="#0D3B66" :height="appBarHeight" :dark="isDark" :light="!isDark">
    <!-- Left-aligned navigation -->
    <v-btn icon class="nav-text" @click="navigateTo('/')">
      <img src="/favicon.ico" alt="Home" style="width: 1.5rem; height: 1.5rem;" />
    </v-btn>

    <!-- Centered Questions Button -->
    <v-btn text class="nav-link d-none d-md-flex" @click="navigateTo('/questions')">
      <span>Questions</span>
    </v-btn>
    <v-btn icon class="nav-link d-flex d-md-none" @click="navigateTo('/questions')" aria-label="Questions">
      <v-icon>mdi-clipboard-text-outline</v-icon>
    </v-btn>

    <!-- Centered Flashcards Button -->
    <v-btn text class="nav-link d-none d-md-flex" @click="navigateTo('/flashcards')">
      <span>Flashcards</span>
    </v-btn>
    <v-btn icon class="nav-link d-flex d-md-none" @click="navigateTo('/flashcards')" aria-label="Flashcards">
      <v-icon>mdi-cards-outline</v-icon>
    </v-btn>

    <v-spacer />

    <!-- Admin Button (only visible to admin users) -->
    <v-btn v-if="isAdmin" text class="nav-link d-none d-md-flex" @click="navigateTo('/admin')">
      <span>Admin</span>
    </v-btn>
    <v-btn v-if="isAdmin" icon class="nav-link d-flex d-md-none" @click="navigateTo('/admin')" aria-label="Admin">
      <v-icon>mdi-shield-account</v-icon>
    </v-btn>

    <v-btn icon class="nav-link" @click="navigateTo('/pro')">
      <span>Pro</span>
    </v-btn>

    <!-- Dark/Light Mode Toggle -->
    <v-btn icon @click="toggleDarkMode" aria-label="Toggle dark mode">
      <v-icon>{{ darkModeIcon }}</v-icon>
    </v-btn>

    <!-- Right Side: Login Button or Profile Dropdown -->
    <div v-if="!isAuthenticated">
      <v-btn text class="nav-link" @click="openLoginModal">Login</v-btn>
    </div>
    <div v-else>
      <v-menu offset-y>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-avatar>
              <img :src="userPhotoURL" />
            </v-avatar>
          </v-btn>
        </template>
        <v-list>
          <v-list-item @click="openOptionModal">
            <v-list-item-title>Quiz Options</v-list-item-title>
          </v-list-item>
          <v-list-item @click="logout">
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </v-app-bar>
  <LoginModal ref="loginModal" />
  <OptionModal ref="optionModal" />
</template>

<script setup>
import { useRouter } from "vue-router";
import { ref, computed } from "vue";
import { useAuthStore } from "@/composables/useAuth";
import { storeToRefs } from "pinia";
import { useDisplay } from "vuetify";
import useDark from "../composables/useDark";

import LoginModal from "./loginModal.vue";
import OptionModal from "./optionModal.vue";
import defaultAvatar from "@/assets/default-avatar.png";

const authStore = useAuthStore();
const { isAuthenticated, user, isAdmin } = storeToRefs(authStore);

const { isDark, darkModeIcon, toggleDarkMode } = useDark();

// Follows the root font-size scaling in App.vue: 64px up to 1920px wide, growing to 96px at 3840px.
// Vuetify needs the app bar height as a number to lay out v-main, so it can't be a rem value.
const { width: viewportWidth } = useDisplay();
const appBarHeight = computed(() => {
  const largeScreenScale = Math.min(Math.max(0.5 + viewportWidth.value / 3840, 1), 1.5);
  return Math.round(64 * largeScreenScale);
});
const userPhotoURL = computed(() => user.value?.photoURL || defaultAvatar);
const loginModal = ref(null);
const optionModal = ref(null);

function openLoginModal() {
  if (loginModal.value && loginModal.value.open) {
    loginModal.value.open();
  }
}

function openOptionModal() {
  if (optionModal.value && optionModal.value.open) {
    optionModal.value.open();
  }
}

function logout() {
  authStore.logout(); // Call the logout action from the Pinia store
}

const router = useRouter();
function navigateTo(path) {
  router.push(path);
}
</script>

<style scoped>
.nav-title {
  display: flex;
  align-items: center;
}

.nav-icon {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.nav-text {
  font-size: 1rem;
  color: white;
}

.nav-link {
  font-size: 1rem;
  color: white;
  text-transform: none;
}

.nav-link:hover {
  color: #FFD700;
}

.v-avatar img {
  border-radius: 50%;
  width: 2rem;
  height: 2rem;
  object-fit: cover;
}

.v-avatar {
  width: 2.25rem;
  height: 2.25rem;
}
</style>
