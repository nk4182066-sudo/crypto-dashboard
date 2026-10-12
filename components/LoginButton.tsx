// Google sign-in button. Educational app — not financial advice.
"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth, signInWithGoogle, signOut, NOT_CONFIGURED } from "@/src/lib/firebase";

/** Firebase error codes mapped to friendly Roman Urdu/English copy. */
const friendlyError = (error: unknown): string => {
  const code = (error as { code?: string }).code;
  if (code === "auth/popup-closed-by-user") return "Popup band ho gaya. Dobara try karein.";
  if (code === "auth/popup-blocked") return "Browser ne popup block kiya. Allow karein.";
  if (code === "auth/account-exists-with-different-credential") return "Ye email pehle se maujood hai.";
  if (error instanceof Error && error.message === NOT_CONFIGURED) return "Google sign-in not configured. Add NEXT_PUBLIC_FIREBASE_API_KEY to .env.local.";
  return "Sign in fail ho gaya. Dobara try karein.";
};

export default function LoginButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(auth === null ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut();
    } catch {
      setError("Logout fail ho gaya. Dobara try karein.");
    }
  };

  if (loading) return <div className="h-10 w-40 animate-pulse rounded-lg bg-zinc-800" aria-hidden="true" />;

  if (error) return (
    <div className="flex items-center gap-2 text-xs text-rose-400" role="alert">
      <span>{error}</span>
      <button type="button" onClick={() => setError(null)} className="underline hover:text-rose-300">Dismiss</button>
    </div>
  );

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
        </svg>
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {user.photoURL ? (
        <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-zinc-200">
          {user.displayName?.charAt(0) ?? "U"}
        </div>
      )}
      <span className="max-w-40 truncate text-sm text-zinc-200">{user.displayName ?? user.email ?? "User"}</span>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
      >
        Logout
      </button>
    </div>
  );
}
