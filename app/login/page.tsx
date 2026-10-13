"use client";

// Professional social login screen — Google + Facebook popup sign-in, styled
// like the real Google/Facebook auth experiences. On success it persists the
// user under the app-wide `td-user` key (so the navbar / user menu recognise the
// session), marks onboarding complete (so the OnboardingGate does not re-block),
// then routes into the dashboard. Educational app — not financial advice.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, NOT_CONFIGURED, onAuthStateChanged } from "@/src/lib/firebase";
import { saveUser } from "@/src/lib/userAuth";
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  type User,
} from "firebase/auth";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

/** localStorage key the OnboardingGate reads — set so the app unlocks after login. */
const ONBOARDING_KEY = "onboarding-complete";

/** Firebase error codes → friendly Roman Urdu/English copy (matches app tone). */
function friendlyError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "auth/popup-closed-by-user") return "Login cancel kiya gaya. Dobara try karein.";
  if (code === "auth/popup-blocked") return "Browser ne popup block kiya. Popup allow karein.";
  if (code === "auth/cancelled-popup-request") return "Login cancel kiya gaya.";
  if (code === "auth/account-exists-with-different-credential")
    return "Ye email pehle se registered hai. Us provider se login karein.";
  if (code === "auth/network-request-failed") return "Network issue. Internet check karein.";
  if (code === "auth/unauthorized-domain") return "Ye domain Firebase mein authorized nahi hai.";
  if (error instanceof Error && error.message === NOT_CONFIGURED)
    return "Social login configured nahi hai. NEXT_PUBLIC_FIREBASE_* keys .env.local mein add karein.";
  return "Login fail ho gaya. Dobara try karein.";
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"google" | "facebook" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const busy = loading !== null;
  const redirecting = useRef(false);

  // Track Firebase availability (auth is null until NEXT_PUBLIC_FIREBASE_* set).
  useEffect(() => {
    setConfigured(auth !== null);
  }, []);

  // If already signed in (Firebase session), skip straight to the dashboard.
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      if (user && !redirecting.current) {
        redirecting.current = true;
        router.replace("/");
      }
    });
    return () => unsub();
  }, [router]);

  /** Marks onboarding complete + persists the signed-in user, then routes in. */
  function completeLogin(user: User, provider: "google" | "facebook") {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      /* ignore quota / private-mode failures */
    }
    saveUser({ name: user.displayName ?? "User", provider });
    redirecting.current = true;
    router.push("/");
  }

  async function handleGoogle() {
    if (busy || !auth) return;
    setLoading("google");
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Force the account chooser so users can pick which Google account to use.
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      completeLogin(result.user, "google");
    } catch (err) {
      console.error("[login] Google error:", err);
      setError(friendlyError(err));
      setLoading(null);
    }
  }

  async function handleFacebook() {
    if (busy || !auth) return;
    setLoading("facebook");
    setError(null);
    try {
      const provider = new FacebookAuthProvider();
      provider.addScope("email");
      provider.addScope("public_profile");
      const result = await signInWithPopup(auth, provider);
      completeLogin(result.user, "facebook");
    } catch (err) {
      console.error("[login] Facebook error:", err);
      setError(friendlyError(err));
      setLoading(null);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-12"
      style={{ backgroundColor: BG }}
    >
      {/* Subtle brand glow behind the card */}
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
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: GREEN }}
          >
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-1 text-center text-2xl font-bold" style={{ color: TEXT }}>
          Trading Student Expert AI
        </h1>
        <p className="mb-7 text-center text-sm" style={{ color: MUTED }}>
          Sign in to continue to your dashboard
        </p>

        {/* Setup hint when Firebase keys are missing */}
        {configured === false && (
          <div
            className="mb-4 rounded-lg border p-3 text-center text-xs"
            style={{ backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.35)", color: "#FCD34D" }}
          >
            Social login configured nahi hai. <code>NEXT_PUBLIC_FIREBASE_*</code> keys{" "}
            <code>.env.local</code> mein add karein.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border p-3 text-center text-sm"
            style={{ backgroundColor: "rgba(245,63,63,0.10)", borderColor: "rgba(245,63,63,0.35)", color: "#F87171" }}
          >
            {error}
          </div>
        )}

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          aria-label="Sign in with Google"
          className="mb-3 flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 font-medium transition-all duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "#FFFFFF", color: "#1F2937" }}
        >
          {loading === "google" ? (
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
          <span>{loading === "google" ? "Signing in…" : "Sign in with Google"}</span>
        </button>

        {/* Facebook button */}
        <button
          type="button"
          onClick={handleFacebook}
          disabled={busy}
          aria-label="Continue with Facebook"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 font-medium text-white transition-all duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "#1877F2" }}
        >
          {loading === "facebook" ? (
            <span
              className="h-5 w-5 animate-spin rounded-full"
              style={{ border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#FFFFFF" }}
              aria-hidden="true"
            />
          ) : (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          )}
          <span>{loading === "facebook" ? "Signing in…" : "Continue with Facebook"}</span>
        </button>

        {/* Secure note */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Secure login — we never see your password
        </p>

        {/* Footer */}
        <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: "#5C6470" }}>
          By continuing, you agree to our{" "}
          <a href="/terms" className="hover:underline" style={{ color: GREEN }}>Terms</a> and{" "}
          <a href="/privacy" className="hover:underline" style={{ color: GREEN }}>Privacy Policy</a>
        </p>
        <p className="mt-3 text-center text-xs" style={{ color: "#5C6470" }}>
          ⚠️ Educational analysis only. Not financial advice.
        </p>
      </div>
    </div>
  );
}
