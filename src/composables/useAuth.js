import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from "firebase/auth";
import { firebaseApp } from "../config/firebaseConfig";
import { clearCache } from "../composables/useQuestion";

// Define the store
export const useAuthStore = defineStore('auth', () => {
  // --- State ---
  const auth = getAuth(firebaseApp); // Keep auth instance reference if needed by actions
  const user = ref(null);
  const member = ref(null);
  const proStatus = ref(null); // Raw status from claims
  const proExpires = ref(null);
  const authInitialized = ref(false); // Tracks initial listener run

  // --- Getters (Computed State) ---
  const isAuthenticated = computed(() => !!user.value); // Derive from user state
  const isPro = computed(() => proStatus.value === 'Monthly' || proStatus.value === 'Lifetime');

  // --- Actions (Methods) ---
  async function fetchClaimsAndSetState(currentUser) {
    if (!currentUser) {
      user.value = null;
      member.value = null;
      proStatus.value = null;
      return; // Exit early if no user
    }

    // Update user ref immediately
    user.value = currentUser;

    try {
      // Force refresh the ID token to get updated custom claims
      const idTokenResult = await currentUser.getIdTokenResult(true); // Force token refresh
      const currentMember = idTokenResult.claims.member || null;
      const currentProStatus = idTokenResult.claims.proStatus || null;
      const currentExpiry = idTokenResult.claims.expires || null;

      member.value = currentMember; // Update member
      proStatus.value = currentProStatus; // Update proStatus
      proExpires.value = currentExpiry; // Update proExpires
    } catch (error) {
      console.error("Error getting ID token result/claims:", error);
      member.value = null;
      proStatus.value = null;
      proExpires.value = null; 
    }
  }

  async function forceClaimRefresh() {
    if (user.value) { // Only run if user is logged in
      await fetchClaimsAndSetState(user.value); // Re-run the claim fetching
    }
  }

  async function googlyLogin() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      clearCache();
    } catch (error) {
      console.error("Error during googly login:", error);
    }
  }

  async function logout() {
    try {
      await signOut(auth);
      clearCache();
      window.location.reload();
    } catch (error) {
      console.error("Error during logout:", error);
    }
  }

  async function sendLoginEmailLink(email) {
     const actionCodeSettings = { url: window.location.origin, handleCodeInApp: true };
     try {
         await sendSignInLinkToEmail(auth, email, actionCodeSettings);
         window.localStorage.setItem("emailForSignIn", email);
     } catch (error) {
         console.error("Error sending email link:", error);
         throw error;
     }
  }

   async function completeEmailLinkLogin() {
     if (isSignInWithEmailLink(auth, window.location.href)) {
         let email = window.localStorage.getItem("emailForSignIn");
         if (!email) { console.error("Email missing for link sign in."); return; }
         try {
             await signInWithEmailLink(auth, email, window.location.href);
             window.localStorage.removeItem("emailForSignIn");
             clearCache();
             window.location.reload();
         } catch (error) {
             console.error("Error completing email link login:", error);
         }
     }
   }

  // --- Listener Setup (runs once when store is initialized) ---
  function initializeAuthListener() {
      onAuthStateChanged(auth, async (currentUser) => {
        await fetchClaimsAndSetState(currentUser); // Fetch claims and update state refs
        authInitialized.value = true; // Mark as initialized AFTER processing
      });
  }

  // Call initialization automatically
  if (!authInitialized.value) { // Basic check to avoid re-running if store setup runs multiple times (unlikely)
      initializeAuthListener();
  }


  // --- Return State, Getters, and Actions ---
  return {
    // State (Refs)
    user,
    proStatus,
    authInitialized,
    proExpires,

    // Getters (Computed)
    isAuthenticated,
    isPro,

    // Actions (Functions)
    googlyLogin,
    logout,
    sendLoginEmailLink,
    completeEmailLinkLogin,
    forceClaimRefresh
    // Expose fetchClaims manually if needed:
    // fetchClaims: () => fetchClaimsAndSetState(user.value)
  };
});