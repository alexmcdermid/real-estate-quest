<template>
  <v-container>
    <v-card class="mb-4">
      <template v-if="authInitialized">
        <template v-if="isAuthenticated && proStatus">
          <template v-if="proStatus === 'Lifetime'">
            <v-card class="mb-4">
              <v-card-title>Pro Status: Lifetime</v-card-title>
              <v-card-text>
                <p>Thank you for your support! You have lifetime access to all content.</p>
              </v-card-text>
            </v-card>
          </template>

          <template v-else-if="proStatus === 'Monthly'">
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
                    <v-btn color="primary" @click.stop="manageSubscription">
                      Manage Subscription
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </template>
            </v-hover>
          </template>
          <template v-else>
            <v-card-text>Checking subscription status...</v-card-text>
          </template>
        </template>
        <template v-else>
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
        </template>
      </template>
      <template v-else>
        <v-skeleton-loader
          class="mx-auto"
          type="card, article"
          elevation="11"
        ></v-skeleton-loader>
      </template>
    </v-card>
  </v-container>

  <LoginModal ref="loginModal" />
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import { useAuthStore } from "../composables/useAuth";
import { storeToRefs } from "pinia";
import useMembership from "../composables/useMembership";
import LoginModal from "./loginModal.vue";
import { useRoute, useRouter } from "vue-router";

const authStore = useAuthStore();
const { authInitialized, isAuthenticated, proStatus } = storeToRefs(authStore);

const { startCheckout, verifyPayment } = useMembership();
const route = useRoute();
const router = useRouter();

const loginModal = ref(null);

function openLoginModal() {
  if (loginModal.value && loginModal.value.open) {
    loginModal.value.open();
  }
}

function handleSubscriptionClick(type) {
  if (!isAuthenticated.value) {
    openLoginModal();
  } else {
    if (type === "monthly") {
      startCheckout("price_1RAZfIDHHGtkTOPhKGMMIQGn");
    } else if (type === "lifetime") {
      startCheckout("price_1RAZgSDHHGtkTOPhyhqr29ai");
    }
  }
}

function manageSubscription() {
  console.log("Redirect to subscription management");
  // Implement logic to redirect to Stripe's customer portal
}

async function handlePaymentSuccess() {
  const sessionId = route.query.sessionId;

  if (!sessionId) {
    console.error("No sessionId found in the URL.");
    return;
  }

  if (!isAuthenticated.value) {
    console.error("User is not authenticated. Waiting for authentication...");
    const stopWatch = watch(
      () => isAuthenticated.value,
      (newVal) => {
        if (newVal) {
          console.log("User is now authenticated. Proceeding with payment verification...");
          stopWatch();
          handlePaymentSuccess();
        }
      }
    );
    return;
  }

  try {
    const result = await verifyPayment(sessionId);

    if (result.success) {
      console.log("Payment verified successfully. Subscription type:", result.subscriptionType);
    } else {
      console.error("Payment verification failed.");
    }
  } catch (error) {
    console.error("Error verifying payment status:", error);
  } finally {
    router.replace({ query: {} });
  }
}

onMounted(() => {
  if (route.query.success === "true") {
    console.log("Success query parameter detected. Calling handlePaymentSuccess...");
    handlePaymentSuccess();
  }
});
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