import { ref } from "vue";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { firebaseApp } from "../config/firebaseConfig";
import { clearCache } from "../composables/useQuestion";

export function useAuth() {
  const auth = getAuth(firebaseApp);
  const isAuthenticated = ref(false);
  const user = ref(null);
  const authInitialized = ref(false);

  // Immediately check if a user is already signed in
  if (auth.currentUser) {
    isAuthenticated.value = true;
    user.value = auth.currentUser;
    authInitialized.value = true;
  } else {
    // Set up the auth state listener
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        isAuthenticated.value = true;
        user.value = currentUser;
      } else {
        isAuthenticated.value = false;
        user.value = null;
      }
      authInitialized.value = true;
    });
  }

  async function login() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      clearCache();
      // Optionally, you may remove reload if using router navigation instead.
      window.location.reload();
    } catch (error) {
      console.error("Error during login:", error);
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

  return { isAuthenticated, user, authInitialized, login, logout };
}
