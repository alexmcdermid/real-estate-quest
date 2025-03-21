<template>
  <v-dialog v-model="dialog" persistent max-width="500">
    <v-card>
      <v-card-title class="headline">Login</v-card-title>
      <v-card-text>
        <v-btn block color="primary" @click="handleGoogleLogin">
          Sign in with Google
        </v-btn>
        <!-- Future login options (e.g. Email Link Sign‑On) can be added here -->
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="close">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, defineExpose } from 'vue'
import { useAuth } from '../composables/useAuth'

const dialog = ref(false)
const { login } = useAuth()

function open() {
  dialog.value = true
}

function close() {
  dialog.value = false
}

function handleGoogleLogin() {
  login()
}

// Expose the open method so parent components can trigger the modal.
defineExpose({ open })
</script>

