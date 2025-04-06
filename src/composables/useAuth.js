import { ref } from "vue";
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

export function useAuth() {
  const auth = getAuth(firebaseApp);
  const isAuthenticated = ref(false);
  const user = ref(null);
  const authInitialized = ref(false);
  const isPro = ref(false);
  const proStatus = ref(null);

  // Set up the auth state listener
  onAuthStateChanged(auth, async (currentUser) => {
    if (currentUser) {
      isAuthenticated.value = true;
      user.value = currentUser;
      // Get ID token result to access custom claims
      try {
        // Force refresh true? Useful after login/claim change, maybe not always needed. Test behavior.
        const idTokenResult = await currentUser.getIdTokenResult(true); // Force refresh to get updated claims
        const currentProStatus = idTokenResult.claims.proStatus || null; // Access the claim

        proStatus.value = currentProStatus; // Store the string status
        isPro.value = currentProStatus === 'Monthly' || currentProStatus === 'Lifetime';

        console.log("Custom claims processed:", idTokenResult.claims);
        console.log("User pro status:", proStatus.value, "isPro:", isPro.value);

        console.log("User pro status:", proStatus);
        if (proStatus === "Monthly") {
          console.log("User has a Monthly subscription");
        } else if (proStatus === "Lifetime") {
          console.log("User has a Lifetime subscription");
        } else {
          console.log("User is not a Pro member");
        }

      } catch (error) {
        console.error("Error getting ID token result/claims:", error);
        isPro.value = false;
        proStatus.value = null;
      }
    } else {
      // User logged out
      isAuthenticated.value = false;
      user.value = null;
      isPro.value = false;
      proStatus.value = null;
    }
    authInitialized.value = true;
    console.log("Auth state changed. Initialized:", authInitialized.value, "Authenticated:", isAuthenticated.value, "isPro:", isPro.value, "Status:", proStatus.value);
  });
  
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
    } catch (error) {
      console.error("Error during logout:", error);
    }
  }

  async function sendLoginEmailLink(email) {
    // Configure the action code settings. Adjust the URL if needed.
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Save the email locally so it can be retrieved after the user clicks the link.
      window.localStorage.setItem("emailForSignIn", email);
    } catch (error) {
      console.error("Error sending email link:", error);
    }
  }
  
  async function completeEmailLinkLogin() {
    // Check if the current URL is a sign-in with email link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      // Retrieve the email from local storage (or prompt the user if not found)
      let email = window.localStorage.getItem("emailForSignIn");
      if (!email) {
        return;
      }
      try {
        await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem("emailForSignIn");
        clearCache();
      } catch (error) {
        console.error("Error completing email link login:", error);
      }
    }
  }

  return {
    isAuthenticated,
    user,
    authInitialized,
    googlyLogin,
    logout,
    sendLoginEmailLink,
    completeEmailLinkLogin,
  };
}
