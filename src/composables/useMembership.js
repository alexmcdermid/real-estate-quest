import { ref } from "vue";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { storeToRefs } from "pinia";
import { useAuthStore } from '../composables/useAuth';
import { clearCache } from "../composables/useQuestion";

export default function useMembership() {
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore); // Use storeToRefs for reactivity

  const functions = getFunctions(firebaseApp, "us-west1");

  const isPro = ref(false);
  const membershipStatus = ref("");
  const expirationDate = ref("");

  // Start a Stripe Checkout session
  async function startCheckout(priceId) {
    console.log("authStore.user:", user.value); // Debug log
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const createCheckoutSessionCallable = httpsCallable(functions, "createCheckoutSession");

      console.log("Payload sent to createCheckoutSession:", {
        priceId,
        successUrl: `${window.location.origin}/pro?success=true`,
        cancelUrl: `${window.location.origin}/pro?canceled=true`,
      });

      const result = await createCheckoutSessionCallable({
        priceId,
        successUrl: `${window.location.origin}/pro?success=true`,
        cancelUrl: `${window.location.origin}/pro?canceled=true`,
      });

      console.log("Redirecting to Stripe Checkout...");
      // Redirect to the URL returned by the backend
      window.location.href = result.data.url;
    } catch (error) {
      console.error("Error starting checkout:", error);
      throw new Error("Failed to start checkout session");
    }
  }

  // Verify payment status
  async function verifyPayment(sessionId) {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const verifyPaymentStatusCallable = httpsCallable(functions, "verifyPaymentStatus");

      const result = await verifyPaymentStatusCallable({ sessionId });
      console.log("Payment verification result:", result.data);

      if (result.data?.success === true) {
        // Force refresh of the ID token to update custom claims
        console.log("ID token refreshed to update custom claims.");
        clearCache();
        await authStore.forceClaimRefresh();
      }

      return result.data; // Return the result from the backend
    } catch (error) {
      console.error("Error verifying payment status:", error);
      throw new Error("Failed to verify payment status");
    }
  }

  // Manage subscription (e.g., redirect to Stripe customer portal)
  async function manageSubscription() {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const manageSubscriptionCallable = httpsCallable(functions, "manageSubscription");

      const result = await manageSubscriptionCallable({});
      console.log("Redirecting to Stripe customer portal...");
      window.location.href = result.data.url; // Redirect to the Stripe customer portal
    } catch (error) {
      console.error("Error managing subscription:", error);
      throw new Error("Failed to manage subscription");
    }
  }

  return {
    isPro,
    membershipStatus,
    expirationDate,
    startCheckout,
    verifyPayment, // Expose verifyPayment
    manageSubscription,
  };
}