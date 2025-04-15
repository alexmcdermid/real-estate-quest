<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title class="headline">Login</v-card-title>
      <v-card-text>
        <!-- Google Login Option -->
        <button class="gsi-material-button" @click="handleGooglyLogin">
          <div class="gsi-material-button-content-wrapper">
            <img src="../assets/google-icon.svg" alt="Google Icon" class="google-icon" />
            <span class="gsi-material-button-contents">Sign in with Google</span>
          </div>
        </button>
        <v-divider class="my-4"></v-divider>
        <!-- Email Login Option -->
        <div v-if="!showEmailInput">
          <v-btn block class="email-login" @click="toggleEmailInput" title="Email Link Login: You will receive a login link via email.">
            Sign in with Email
          </v-btn>
        </div>
        <div v-else>
          <v-text-field
            v-model="email"
            label="Email Link Login"
            type="email"
            placeholder="you@example.com"
            :error="emailError"
            :disabled="emailSent"
            @input="validateEmail"
          />
          <v-btn
            block
            class="email-login-button"
            :disabled="!isValidEmail || emailSent"
            @click="handleEmailLinkLogin"
          >
            {{ emailSent ? "Email Sent" : "Send Email Link" }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-text class="login-blurb">
        By signing in, you agree to BC Real Estate Quest's Terms of Service and Privacy Policy.
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="close">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useAuthStore } from '@/composables/useAuth';
const authStore = useAuthStore();

const dialog = ref(false);
const email = ref("");
const showEmailInput = ref(false);
const emailError = ref(false);
const emailSent = ref(false);
const isLoggingIn = ref(false);
const emailSending = ref(false);

// Expose an open method so the parent (navbar) can trigger the modal.
function open() {
  dialog.value = true;
}
defineExpose({ open });

function close() {
  dialog.value = false;
}

async function handleGooglyLogin() {
  isLoggingIn.value = true; // Start loading
  try {
    await authStore.googlyLogin();
    window.location.reload();
  } catch (error) {
    console.error("Google Login failed:", error);
  } finally {
    isLoggingIn.value = false;
  }
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

async function handleEmailLinkLogin() {
  validateEmail();
  if (isValidEmail.value && !emailError.value) {
    emailSending.value = true;
    try {
      await authStore.sendLoginEmailLink(email.value);
      emailSent.value = true;
    } catch (error) {
      console.error("Failed to send email link:", error);
    } finally {
      emailSending.value = false;
    }
  } else {
    console.error("Attempted to send link with invalid email.");
    emailError.value = true;
  }
}

// On mount, attempt to complete email link login if the URL is valid.
onMounted(() => {
  authStore.completeEmailLinkLogin();
});
</script>

<style scoped>
.gsi-material-button {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: bold;
  color: #555;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: 20px;
  width: 100%;
  box-sizing: border-box;
}

.gsi-material-button:hover {
  background-color: #f7f7f7;
  border-color: #ccc;
}

.gsi-material-button-content-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.google-icon {
  width: 24px;
  height: 24px;
  margin-right: 10px;
}

.email-login {
  background: #007bff;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s ease;
  width: 100%;
}

.email-login:hover {
  background: #0056b3;
}

.email-login-button {
  background: #28a745;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s ease;
  width: 100%;
}

.email-login-button:hover {
  background: #218838;
}

.login-blurb {
  font-size: 13px !important;
  color: #666;
  text-align: center;
}

.login-blurb a {
  color: #007bff;
  text-decoration: none;
}

.login-blurb a:hover {
  text-decoration: underline;
}
</style>
