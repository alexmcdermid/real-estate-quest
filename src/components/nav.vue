<template>
  <v-app-bar app flat color="primary" dark>
    <v-toolbar-title>
      real-estate-quest
    </v-toolbar-title>
    <v-spacer></v-spacer>
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
import { ref, computed } from "vue";
import { useAuth } from "../composables/useAuth";
import LoginModal from "./loginModal.vue";

const { isAuthenticated, user, logout } = useAuth();
const userPhotoURL = computed(() => user.value?.photoURL || "");
const loginModal = ref(null);

function openLoginModal() {
  if (loginModal.value && loginModal.value.open) {
    loginModal.value.open();
  }
}

function goToProfile() {
  console.log("Navigating to profile");
}
</script>

<style scoped>
.v-toolbar-title img {
  vertical-align: middle;
}
</style>
