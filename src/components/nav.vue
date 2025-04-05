<template>
  <v-app-bar app flat color="#0D3B66" :dark="isDark" :light="!isDark">
    <!-- Left-aligned navigation -->
    <v-btn icon class="nav-text" @click="navigateTo('/')">
      <v-icon>mdi-home</v-icon>
    </v-btn>

    <!-- Centered Questions Button -->
    <v-btn text class="nav-link" @click="navigateTo('/questions')">
      <span>Questions</span>
    </v-btn>

    <v-spacer />

    <v-btn icon class="nav-link" @click="navigateTo('/profile')">
      <span>Pro</span>
    </v-btn>

    <!-- Dark/Light Mode Toggle -->
    <v-btn icon @click="toggleDarkMode">
      <v-icon>{{ darkModeIcon }}</v-icon>
    </v-btn>

    <!-- Right Side: Login Button or Profile Dropdown -->
    <div v-if="!isAuthenticated">
      <v-btn text @click="openLoginModal">Login</v-btn>
    </div>
    <div v-else>
      <v-menu offset-y>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-avatar>
              <img :src="userPhotoURL" alt="Profile" />
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
import { useRouter } from 'vue-router';
import { ref, computed } from "vue";
import useDark from "../composables/useDark";
import { useAuth } from "../composables/useAuth";
import LoginModal from "./loginModal.vue";
import OptionModal from "./optionModal.vue";

const { isDark, darkModeIcon, toggleDarkMode } = useDark();
const { isAuthenticated, user, logout } = useAuth();
const userPhotoURL = computed(() => user.value?.photoURL || "");
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
  font-size: 1.25rem;
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

.v-toolbar-title img {
  vertical-align: middle;
}
</style>
