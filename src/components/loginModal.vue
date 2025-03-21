<template>
  <v-dialog v-model="dialog" persistent max-width="500">
    <v-card>
      <v-card-title class="headline">Login</v-card-title>
      <v-card-text>
        <!-- Googly Login Option -->
        <v-btn block color="primary" @click="handleGooglyLogin">
          Sign in with Googly
        </v-btn>
        <v-divider class="my-4"></v-divider>
        <!-- Email Login Option -->
        <div v-if="!showEmailInput">
          <v-btn block color="secondary" @click="toggleEmailInput">
            Login with Email
          </v-btn>
        </div>
        <div v-else>
          <v-text-field
            v-model="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            :error="emailError"
            :disabled="emailSent"
            @input="validateEmail"
          />
          <v-btn
            block
            color="secondary"
            :disabled="!isValidEmail || emailSent"
            @click="handleEmailLinkLogin"
          >
            {{ emailSent ? "Email Sent" : "Send Email Link" }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="close">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, onMounted, defineExpose } from "vue";
import { useAuth } from "../composables/useAuth";

const dialog = ref(false);
const email = ref("");
const showEmailInput = ref(false);
const emailError = ref(false);
const emailSent = ref(false);

const { googlyLogin, sendLoginEmailLink, completeEmailLinkLogin } = useAuth();

// Expose an open method so the parent (navbar) can trigger the modal.
function open() {
  dialog.value = true;
}
defineExpose({ open });

function close() {
  dialog.value = false;
}

function handleGooglyLogin() {
  googlyLogin();
}

// Toggle the email input display.
function toggleEmailInput() {
  showEmailInput.value = !showEmailInput.value;
}

// Regex validation for email.
const isValidEmail = computed(() => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.value);
});
function validateEmail() {
  emailError.value = !isValidEmail.value;
}

function handleEmailLinkLogin() {
  if (isValidEmail.value) {
    sendLoginEmailLink(email.value);
    emailSent.value = true;
  } else {
    console.error("Invalid email format");
  }
}

// On mount, attempt to complete email link login if the URL is valid.
onMounted(() => {
  completeEmailLinkLogin();
});
</script>
