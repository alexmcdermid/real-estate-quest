<template>
  <v-app-bar app flat color="primary" dark>
    <!-- Home / Logo Section -->
    <v-toolbar-title>
      real-estate-quest
    </v-toolbar-title>
    <v-spacer></v-spacer>

    <!-- Right Side: Login Button or Profile Dropdown -->
    <div v-if="!isAuthenticated">
      <v-btn text @click="login">Login</v-btn>
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
</template>

<script setup>
import { computed } from "vue";
import { useAuth } from "../composables/useAuth"; // Custom composable for auth state

// Get reactive auth properties and functions from your composable.
const { isAuthenticated, user, login, logout } = useAuth();

// For profile picture; use a default placeholder if none is available.
const userPhotoURL = computed(() => user.value?.photoURL || "");

function goToProfile() {
  // todo vue router
  console.log("Navigating to profile");
}
</script>

<style scoped>
.v-toolbar-title img {
  vertical-align: middle;
}
</style>
