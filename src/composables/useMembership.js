import { ref } from "vue";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { useAuth } from "./useAuth";

export default function useMembership() {
  const { user } = useAuth(); // Use user from useAuth
  const functions = getFunctions(firebaseApp, "us-west1");

  const isPro = ref(false);
  const membershipStatus = ref("");
  const expirationDate = ref("");

  // Fetch membership status from Firebase Functions
  async function fetchMembershipStatus() {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const idToken = await user.value.getIdToken(true); // Force refresh to get updated claims
      const getMembershipStatusCallable = httpsCallable(functions, "getMembershipStatus");

      const result = await getMembershipStatusCallable({ idToken });
      isPro.value = result.data.member || false;
      membershipStatus.value = result.data.status || "inactive";
      expirationDate.value = result.data.expirationDate || null;

      console.log("Membership status fetched:", result.data);
    } catch (error) {
      console.error("Error fetching membership status:", error);
      throw new Error("Failed to fetch membership status");
    }
  }

  // Start a Stripe Checkout session
  async function startCheckout(priceId) {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const idToken = await user.value.getIdToken(true); // Force refresh to ensure valid token
      const createCheckoutSessionCallable = httpsCallable(functions, "createCheckoutSession");

      console.log("Payload sent to createCheckoutSession:", {
        priceId,
        successUrl: `${window.location.origin}/profile?success=true`,
        cancelUrl: `${window.location.origin}/profile?canceled=true`,
        idToken,
      });

      const result = await createCheckoutSessionCallable({
        priceId,
        successUrl: `${window.location.origin}/profile?success=true`,
        cancelUrl: `${window.location.origin}/profile?canceled=true`,
        idToken, // Pass the ID token for authentication
      });

      console.log("Redirecting to Stripe Checkout...");
      // Redirect to the URL returned by the backend
      window.location.href = result.data.url;
    } catch (error) {
      console.error("Error starting checkout:", error);
      throw new Error("Failed to start checkout session");
    }
  }

  // Manage subscription (e.g., redirect to Stripe customer portal)
  async function manageSubscription() {
    if (!user.value) {
      console.error("User is not authenticated");
      throw new Error("User is not authenticated");
    }

    try {
      const idToken = await user.value.getIdToken(true); // Force refresh to ensure valid token
      const manageSubscriptionCallable = httpsCallable(functions, "manageSubscription");

      const result = await manageSubscriptionCallable({ idToken });
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
    fetchMembershipStatus,
    startCheckout,
    manageSubscription,
  };
}