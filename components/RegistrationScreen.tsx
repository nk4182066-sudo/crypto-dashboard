"use client";

// Registration — Google sign-in only (Facebook removed).
// Real Firebase popup auth (via the userAuth wrappers, which fall back to a
// local placeholder if Firebase is not configured so the flow never dead-ends).
// No phone / OTP / reCAPTCHA. Educational only. Not financial advice.
import { useState } from "react";
import { googleSignIn, type AppUser } from "@/src/lib/userAuth";

const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

export default function RegistrationScreen({
  onComplete,
  onSkip,
}: {
  onComplete: (user?: AppUser) => void;
  onSkip: () => void;
}) {
  const [busy, setBusy] = useState<"google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setBusy("google");
    try {
      const user = await googleSignIn();
      onComplete(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-5">
      <div className="w-full max-w-sm">
        {/* Heading */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black"
            style={{ backgroundColor: GREEN, color: "#0B0E11" }}
          >
            T
          </div>
          <h1 className="text-2xl font-bold" style={{ color: TEXT }}>
            Trading Student Expert AI
          </h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Continue karein apni journey shuru karne ke liye
          </p>
        </div>

        {/* Error */}
        {error && (
          <p
            className="mb-4 rounded-lg border px-3 py-2 text-center text-xs"
            style={{ borderColor: "#F6465D", color: "#F6465D", backgroundColor: "rgba(246,70,93,0.08)" }}
          >
            {error}
          </p>
        )}

        {/* Two sign-in options only */}
        <div className="space-y-3">
          {/* 1. Google — white bg */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-3 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#FFFFFF", color: "#1F2937" }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4285F4] text-xs font-bold text-white">
              G
            </span>
            {busy === "google" ? "Signing in..." : "🔵 Continue with Google"}
          </button>
        </div>

        {/* Skip */}
        <button
          type="button"
          onClick={onSkip}
          className="mt-6 w-full text-center text-xs"
          style={{ color: MUTED }}
        >
          Skip for now →
        </button>

        <p className="mt-6 text-center text-[10px] leading-relaxed" style={{ color: MUTED }}>
          ⚠️ Educational app only. Not financial advice.
        </p>
      </div>
    </div>
  );
}

