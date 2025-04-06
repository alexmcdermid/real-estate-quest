<template>
  <v-container>
    <v-card class="mb-4">
      <v-card-title>Upgrade to Pro</v-card-title>
      <v-card-text>
        <p>Pass your BC Real Estate Licensing Exam on the first try with confidence!</p>
        <p>Get access today and unlock 800+ high-quality practice questions. Look forward to upcoming flashcards and new questions to keep you one step ahead.</p>
        <v-row class="mt-4">
          <v-col cols="12" md="6">
            <v-hover>
              <template #default="{ isHovering }">
                <v-card
                  outlined
                  :elevation="isHovering ? 8 : 2"
                  class="clickable-card"
                  @click="handleSubscriptionClick('monthly')"
                >
                  <v-card-title>Monthly Subscription</v-card-title>
                  <v-card-text>
                    <p>$25/month</p>
                    <p>Unlimited access to all content.</p>
                  </v-card-text>
                  <v-card-actions>
                    <v-btn color="primary" @click.stop="handleSubscriptionClick('monthly')">
                      {{ isAuthenticated ? "Subscribe" : "Log In to Subscribe" }}
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </template>
            </v-hover>
          </v-col>
          <v-col cols="12" md="6">
            <v-hover>
              <template #default="{ isHovering }">
                <v-card
                  outlined
                  :elevation="isHovering ? 8 : 2"
                  class="clickable-card"
                  @click="handleSubscriptionClick('lifetime')"
                >
                  <v-card-title>Lifetime Access</v-card-title>
                  <v-card-text>
                    <p>$99 one-time payment</p>
                    <p>Unlimited lifetime access to all content.</p>
                  </v-card-text>
                  <v-card-actions>
                    <v-btn color="primary" @click.stop="handleSubscriptionClick('lifetime')">
                      {{ isAuthenticated ? "Buy Lifetime" : "Log In to Buy" }}
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </template>
            </v-hover>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Display Pro Status -->
    <template v-if="isAuthenticated && subscriptionStatus">
      <template v-if="subscriptionStatus === 'Lifetime'">
        <v-card class="mb-4">
          <v-card-title>Pro Status: Lifetime</v-card-title>
          <v-card-text>
            <p>Thank you for your support! You have lifetime access to all content.</p>
          </v-card-text>
        </v-card>
      </template>

      <template v-else-if="subscriptionStatus === 'Monthly'">
        <v-hover>
          <template #default="{ isHovering }">
            <v-card
              outlined
              :elevation="isHovering ? 8 : 2"
              class="clickable-card"
              @click="manageSubscription"
            >
              <v-card-title>Pro Status: Monthly</v-card-title>
              <v-card-text>
                <p>Your subscription is active. You can manage your subscription below.</p>
              </v-card-text>
              <v-card-actions>
                <v-btn color="primary" @click.stop="manageSubscription">Manage Subscription</v-btn>
              </v-card-actions>
            </v-card>
          </template>
        </v-hover>
      </template>
    </template>
  </v-container>

  <LoginModal ref="loginModal" />
</template>

<script setup>
import { ref } from "vue";
import { useAuth } from "../composables/useAuth";
import useMembership from "../composables/useMembership";
import LoginModal from "./loginModal.vue";

const { isAuthenticated, isPro, proStatus } = useAuth();
const { startCheckout } = useMembership();

const subscriptionStatus = ref(null); // Tracks the user's subscription status
const loginModal = ref(null);
const subscriptionModal = ref(null);

// Open the login modal
function openLoginModal() {
  if (loginModal.value && loginModal.value.open) {
    loginModal.value.open();
  }
}

// Handle subscription click
function handleSubscriptionClick(type) {
  if (!isAuthenticated.value) {
    openLoginModal();
  } else {
    if (type === "monthly") {
      startCheckout("price_1RAZfIDHHGtkTOPhKGMMIQGn"); // Replace with your actual Stripe price ID for monthly
    } else if (type === "lifetime") {
      startCheckout("price_1RAZgSDHHGtkTOPhyhqr29ai"); // Replace with your actual Stripe price ID for lifetime
    }
  }
}

// Manage subscription (redirect to Stripe customer portal)
function manageSubscription() {
  console.log("Redirect to subscription management");
  // Implement logic to redirect to Stripe's customer portal
}

// Watch for changes in `isPro` to update subscription status
if (isPro) {
  subscriptionStatus.value = isPro;
}
</script>

<style scoped>
.clickable-card {
  cursor: pointer;
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}

.clickable-card:hover {
  transform: translateY(-2px);
}
</style>