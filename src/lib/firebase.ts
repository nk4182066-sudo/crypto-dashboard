// Firebase auth bootstrap. Educational app — not financial advice.
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, type Auth } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";

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

/** Error code surfaced when sign-in is attempted without Firebase config. */
export const NOT_CONFIGURED = "auth/not-configured";
export const googleProvider = new GoogleAuthProvider();

/** Popup-based Google sign-in. Throws so callers can surface the error. */
export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error(NOT_CONFIGURED);
  await signInWithPopup(auth, googleProvider);
}

/** Signs the current user out. Throws so callers can surface the error. */
export async function signOut(): Promise<void> {
  if (!auth) throw new Error(NOT_CONFIGURED);
  await firebaseSignOut(auth);
}
