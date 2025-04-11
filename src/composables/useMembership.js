import { ref } from "vue";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { storeToRefs } from "pinia";
import { useAuthStore } from '../composables/useAuth';

export default function useMembership() {
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const functions = getFunctions(firebaseApp, "us-west1");

  async function startCheckout(priceId) {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const createCheckoutSessionCallable = httpsCallable(functions, "createCheckoutSession");

      const result = await createCheckoutSessionCallable({
        priceId,
        successUrl: `${window.location.origin}/pro?success=true`,
        cancelUrl: `${window.location.origin}/pro?canceled=true`,
      });

      window.location.href = result.data.url;
    } catch (error) {
      console.error("Error starting checkout:", error);
      throw new Error("Failed to start checkout session");
    }
  }

  async function manageSubscription() {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const manageSubscriptionCallable = httpsCallable(functions, "manageSubscription");

      const result = await manageSubscriptionCallable({
        returnUrl: `${window.location.origin}/pro`,
      });

      window.location.href = result.data.url;
    } catch (error) {
      console.error("Error managing subscription:", error);
      throw new Error("Failed to manage subscription");
    }
  }

  return {
    startCheckout,
    manageSubscription,
  };
}