"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, NOT_CONFIGURED, signInWithGoogle, onAuthStateChanged } from "@/src/lib/firebase";
import { saveUser } from "@/src/lib/userAuth";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

/** Firebase error codes → friendly Roman Urdu/English copy (matches app tone). */
function friendlyError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "auth/network-request-failed") return "Network issue. Internet check karein.";
  if (code === "auth/email-already-in-use") return "Email already in use.";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  if (error instanceof Error && error.message === NOT_CONFIGURED)
    return "Firebase configured nahi hai. NEXT_PUBLIC_FIREBASE_* keys .env.local mein add karein.";
  return "Login fail ho gaya. Dobara try karein.";
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const busy = loading;
  const redirecting = useRef(false);

  useEffect(() => {
    setConfigured(auth !== null);
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) window.location.href = "/";
    });
    return unsub;
  }, []);

  function completeLogin(user: { displayName?: string | null }) {
    try {
      localStorage.setItem("onboarding-complete", "true");
    } catch {
      /* ignore quota / private-mode failures */
    }
    saveUser({ name: user.displayName ?? "User", provider: "google" });
    redirecting.current = true;
    window.location.href = "/";
  }

  async function handleGoogle() {
    if (busy || !auth) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      completeLogin(result);
    } catch (err) {
      console.error("[login] Google error:", err);
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-12"
      style={{ backgroundColor: BG }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 320px at 50% 12%, rgba(0,192,135,0.10), transparent 70%)",
        }}
      />

      <div
        className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
      >
        <div className="mb-6 flex justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: GREEN }}
          >
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-bold" style={{ color: TEXT }}>
          Trading Student Expert AI
        </h1>
        <p className="mb-7 text-center text-sm" style={{ color: MUTED }}>
          Sign in to continue to your dashboard
        </p>

        {configured === false && (
          <div
            className="mb-4 rounded-lg border p-3 text-center text-xs"
            style={{
              backgroundColor: "rgba(245,158,11,0.08)",
              borderColor: "rgba(245,158,11,0.35)",
              color: "#FCD34D",
            }}
          >
            Social login configured nahi hai.{" "}
            <code>NEXT_PUBLIC_FIREBASE_*</code> keys <code>.env.local</code> mein add
            karein.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border p-3 text-center text-sm"
            style={{
              backgroundColor: "rgba(245,63,63,0.10)",
              borderColor: "rgba(245,63,63,0.35)",
              color: "#F87171",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          aria-label="Sign in with Google"
          className="mb-3 flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 font-medium transition-all duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "#FFFFFF", color: "#1F2937" }}
        >
          {loading ? (
            <span
              className="h-5 w-5 animate-spin rounded-full"
              style={{ border: "2px solid rgba(31,41,55,0.25)", borderTopColor: "#1F2937" }}
              aria-hidden="true"
            />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
            </svg>
          )}
          <span>{loading ? "Signing in…" : "Sign in with Google"}</span>
        </button>
        <div className="mb-3 flex items-center" style={{ gap: 16 }}>
          <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
          <span className="text-xs" style={{ color: MUTED }}>OR</span>
          <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
        </div>

        <button
          type="button"
          onClick={() => router.push("/signup")}
          aria-label="Sign up with email"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 font-medium text-white transition-all duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: GREEN }}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a2 2 0 1 1 4 0m-4 0a2 2 0 1 0 4 0M9 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m6 4a2 2 0 1 1 0-4 2 2 0 0 0 0 4m6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4m6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4m-6 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4"
            />
          </svg>
          <span>Sign Up with Email</span>
        </button>

        <p className="mt-4 text-center text-sm" style={{ color: MUTED }}>
          Already have an account?{" "}
          <a href="/login" className="font-medium text-green-500 hover:underline">
            Sign In
          </a>
        </p>

        <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: "#5C6470" }}>
          By continuing, you agree to our{" "}
          <a href="/terms" className="hover:underline" style={{ color: GREEN }}>
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="hover:underline" style={{ color: GREEN }}>
            Privacy
          </a>
        </p>
        <p className="mt-3 text-center text-xs" style={{ color: "#5C6470" }}>
          ⚠ Educational only. Not financial advice.
        </p>
      </div>
    </div>
  );
}