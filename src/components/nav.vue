<template>
  <v-app-bar app flat color="primary" dark>
    <!-- Home / Logo Section -->
    <v-toolbar-title>
      real-estate-quest
    </v-toolbar-title>
    <v-spacer></v-spacer>

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
          <v-list-item @click="goToProfile">
            <v-list-item-title>Profile</v-list-item-title>
          </v-list-item>
          <v-list-item @click="logout">
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </v-app-bar>
  <LoginModal ref="loginModal" />
</template>

<script setup>
import { computed, ref } from "vue";
import { useAuth } from "../composables/useAuth";
import LoginModal from "./loginModal.vue";

// Get reactive auth properties and functions from your composable.
const { isAuthenticated, user, logout } = useAuth();

// For profile picture; use a default placeholder if none is available.
const userPhotoURL = computed(() => user.value?.photoURL || "");

// Create a ref for the login modal component.
const loginModal = ref(null);

// Trigger the open() method exposed by LoginModal.
function openLoginModal() {
  if (loginModal.value && loginModal.value.open) {
    loginModal.value.open();
  }
}

function goToProfile() {
  // todo: implement vue router navigation to the profile page
  console.log("Navigating to profile");
}
</script>

<style scoped>
.v-toolbar-title img {
  vertical-align: middle;
}
</style>
