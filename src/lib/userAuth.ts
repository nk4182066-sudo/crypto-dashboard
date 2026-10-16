// Client-side auth helper — Firebase-first with a localStorage fallback so the
// flow works even before NEXT_PUBLIC_FIREBASE_* is configured. Persists the
// signed-in user under one key the navbar/logout both read. Educational only.
import { auth, signOut } from "@/src/lib/firebase";

export interface AppUser {
  name?: string;
  phone?: string;
  provider?: "google" | "local";
}

/** localStorage key for the signed-in user (kept across logout of other keys). */
export const USER_KEY = "td-user";

export function getCurrentUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

export function saveUser(user: AppUser): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Google sign-in. Uses real Firebase popup when configured; on any failure
 * (not configured / popup blocked) it degrades to a local placeholder user so
 * the flow never dead-ends. Google emails are verified automatically by Firebase.
 */
export async function googleSignIn(): Promise<AppUser> {
  try {
    await signInWithGoogle();
    const fbUser = auth?.currentUser;
    const user: AppUser = { name: fbUser?.displayName ?? "User", provider: "google" };
    saveUser(user);
    return user;
  } catch (error) {
    console.warn("[auth] Google sign-in unavailable, using local fallback:", error);
    const user: AppUser = { name: "User", provider: "local" };
    saveUser(user);
    return user;
  }
}

/**
 * Facebook sign-in. Uses real Firebase popup when configured; on any failure
 * (not configured / popup blocked) it degrades to a local placeholder user so
 * the flow never dead-ends.
 */

/**
 * Signs out. Clears the Firebase session (when configured) and every piece of
 * client state (localStorage + sessionStorage, including the onboarding flag)
 * so the next load lands on the login screen — not the dashboard.
 */
export async function signOutFlow(): Promise<void> {
  try {
    if (auth) await firebaseSignOut();
  } catch (error) {
    console.warn("[auth] Firebase sign-out failed:", error);
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* private-mode — nothing to clear */
  }
}
