import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { storeToRefs } from "pinia";
import { useAuthStore } from '../composables/useAuth';
import { showNotification } from '@/composables/useNotifier';

export default function useMembership() {
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const functions = getFunctions(firebaseApp, "us-west1");

  async function startCheckout(type) {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const createCheckoutSessionCallable = httpsCallable(functions, "createCheckoutSession");

      const result = await createCheckoutSessionCallable({
        type,
        successUrl: `${window.location.origin}/pro?success=true`,
        cancelUrl: `${window.location.origin}/pro?canceled=true`,
      });

      window.location.href = result.data.url;
    } catch (error) {
      console.error("Error starting checkout:", error);
      const msg = error?.message || 'Failed to start checkout session';
      try { showNotification(msg, 'warning', 10000); } catch (e) {}
      throw new Error(msg);
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
      const msg = error?.message || "Failed to manage subscription";
      try { showNotification(msg, 'warning', 10000); } catch (e) {}
      throw new Error(msg);
    }
  }

  return {
    startCheckout,
    manageSubscription,
  };
}