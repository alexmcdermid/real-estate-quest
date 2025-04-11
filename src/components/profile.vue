<template>
  <v-container>
    <v-card class="mb-4">
      <template v-if="authInitialized">
        <template v-if="isAuthenticated && proStatus">
          <template v-if="proStatus === 'Lifetime'">
            <v-card-title>Pro Status: Lifetime</v-card-title>
            <v-card-text>
              <p>Thank you for your support! You have lifetime access to all content.</p>
            </v-card-text>
          </template>

          <template v-else-if="proStatus === 'Monthly'">
            <v-col cols="12" md="6">
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
                      <p v-if="proExpires">Your subscription expires: {{ formatDate(proExpires) }}. You can manage your subscription below.</p>
                      <p v-else>Your subscription is active. You can manage your subscription below.</p>
                    </v-card-text>
                    <v-card-actions>
                      <v-btn color="primary" @click.stop="manageSubscription">
                        Manage Subscription
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
          </template>
          <template v-else>
            <v-card-text>Checking subscription status...</v-card-text>
          </template>
        </template>
        <template v-else>
          <v-card-title>Upgrade to Pro</v-card-title>
          <v-card-text>
            <p class="pb-1">Pass your BC Real Estate Licensing Exam on the first try with confidence!</p>
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
import { ref, onMounted } from "vue";
import { useAuthStore } from "../composables/useAuth";
import { storeToRefs } from "pinia";
import useMembership from "../composables/useMembership";
import LoginModal from "./loginModal.vue";
import { useRoute, useRouter } from "vue-router";

const authStore = useAuthStore();
const { authInitialized, isAuthenticated, proStatus, proExpires } = storeToRefs(authStore);

const { startCheckout, manageSubscription } = useMembership();
const route = useRoute();
const router = useRouter();

const loginModal = ref(null);
const pendingCheckoutType = ref(null);

function openLoginModal() {
  if (loginModal.value && loginModal.value.open) {
    loginModal.value.open();
  }
}

function handleSubscriptionClick(type) {
  if (!isAuthenticated.value) {
    pendingCheckoutType.value = type; // Store the type
    openLoginModal();
  } else {
    startCheckoutByType(type);
  }
}

function startCheckoutByType(type) {
  if (type === "monthly") {
    startCheckout("price_1RAZfIDHHGtkTOPhKGMMIQGn");
  } else if (type === "lifetime") {
    startCheckout("price_1RAZgSDHHGtkTOPhyhqr29ai");
  }
}

const formatDate = (timestamp) => {
  if (!timestamp || timestamp === null) return "";
  const date = typeof timestamp === "number"
    ? new Date(timestamp * 1000)
    : new Date(timestamp); // fallback
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
};

onMounted(() => {
  if (route.query.success === "true") {
    console.log("Payment successful. Waiting for webhook to update subscription status...");
    router.replace({ query: {} });
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