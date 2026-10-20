// Firebase auth bootstrap — Google + Facebook popup providers.
// Educational app — not financial advice.
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Missing until NEXT_PUBLIC_FIREBASE_* vars are added to .env.local. */
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

/** Reuse the singleton across hot reloads so `auth` stays stable. */
const app = getApps().length > 0 ? getApps()[0] : isConfigured ? initializeApp(firebaseConfig) : null;

/** `null` when Firebase is not configured — UI shows a setup hint instead of crashing. */
export const auth: Auth | null = app ? getAuth(app) : null;

/** Firestore database instance (null when Firebase is not configured). */
export const db = app ? getFirestore(app) : null;
export const COLLECTION_USERS = "users";
export const COLLECTION_NOTIFICATIONS = "notifications";

/** Error code surfaced when sign-in is attempted without Firebase config. */
export const NOT_CONFIGURED = "auth/not-configured";

export const googleProvider = new GoogleAuthProvider();

/**
 * Popup-based Google sign-in. Throws so callers can surface the error.
 * A fresh provider per call with `prompt: 'select_account'` forces the Google
 * account chooser every time (MASLA 9) — so logging back in after a logout
 * always shows the chooser instead of silently reusing the last account.
 */
export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error(NOT_CONFIGURED);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Professional logout. Signs out of Firebase first (removes the session), then
 * wipes every piece of client state — localStorage + sessionStorage INCLUDING
 * the "onboarding-complete" flag — so the next load starts at the login screen
 * instead of the dashboard. Throws so callers can surface an error.
 */
export async function signOutUser(): Promise<void> {
  if (auth) {
    await firebaseSignOut(auth);
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* private-mode — nothing to clear */
  }
}

/** Legacy alias kept for existing callers. */
export const signOut = signOutUser;

export { onAuthStateChanged };

