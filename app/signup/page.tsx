"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, type AuthError } from "firebase/auth";
import { auth, db, COLLECTION_USERS, onAuthStateChanged, signInWithGoogle } from "@/src/lib/firebase";
import { clearUser } from "@/src/lib/userAuth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F87171";

export interface SignUpForm {
  name: string;
  email: string;
  phone: string;
  age: string;
  city: string;
  country: string;
  fullAddress: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

interface SignUpErrors {
  [key: string]: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MIN_DIGITS = 10;

function validate(form: SignUpForm): SignUpErrors {
  const errors: SignUpErrors = {};
  if (form.name.trim().length < 2) errors.name = "Name minimum 2 characters hai.";
  if (!EMAIL_RE.test(form.email.trim())) errors.email = "Sahi email daalo (name@domain.com).";
  const digits = form.phone.replace(/\D/g, "");
  if (digits.length < PHONE_MIN_DIGITS) errors.phone = "Sahi phone number daalo (10+ digits).";
  const age = Number(form.age);
  if (!form.age || isNaN(age) || age < 13 || age > 100) errors.age = "13+ age required.";
  if (!form.city.trim()) errors.city = "City zaroor daalo.";
  if (!form.country.trim()) errors.country = "Country zaroor daalo.";
  if (form.fullAddress.trim().length < 5) errors.fullAddress = "Full address minimum 5 characters ka ho.";
  if (form.password.length < 6) errors.password = "Password minimum 6 characters.";
  if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords match nahi kar rahe.";
  if (!form.terms) errors.terms = "Terms & Privacy agree karna zaroor hai.";
  return errors;
}

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-sm" style={{ color: TEXT }}>
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs" style={{ color: RED }}>{error}</p>}
    </div>
  );
}

interface InputProps {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  min?: number;
  max?: number;
}

function Input({ type, value, onChange, placeholder, error, min, max }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      style={{
        width: "100%",
        background: "#0F1219",
        border: error ? "1.5px solid #F87171" : `1px solid ${BORDER}`,
        color: TEXT,
        borderRadius: "0.75rem",
        padding: "0.75rem 1rem",
        fontSize: "0.95rem",
        outline: "none",
        transition: "border-color 0.15s",
      }}
    />
  );
}

export default function SignUpPage() {
  const router = useRouter();

  // Agar pehle se logged in hai → dashboard pe bhejo.
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) window.location.href = "/";
    });
    return unsub;
  }, []);

  const [form, setForm] = useState<SignUpForm>({
    name: "",
    email: "",
    phone: "",
    age: "",
    city: "",
    country: "",
    fullAddress: "",
    password: "",
    confirmPassword: "",
    terms: false,
  });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const busy = submitting;
  const redirecting = useRef(false);

  useEffect(() => {
    setSubmitError(null);
  }, []);

  function handleChange(field: keyof SignUpForm) {
    return (v: string) => {
      setForm((prev) => ({ ...prev, [field]: v }));
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    try {
      if (!auth || !db) throw new Error("Firebase not configured");

      // 1. Firebase Auth mein user create karein
      let result: any;
      try {
        result = await createUserWithEmailAndPassword(auth, form.email, form.password);
      } catch (authError: any) {
        console.log("Signup Error:", authError.code, authError.message);
        const code = authError?.code;
        if (code === "auth/email-already-in-use") {
          setSubmitError("Email already in use — yeh email pehle se registered hai. Login karein.");
        } else if (code === "auth/weak-password") {
          setSubmitError("Password kam se kam 6 characters ka hona chahiye.");
        } else if (code === "auth/network-request-failed") {
          setSubmitError("Internet connection check karein.");
        } else {
          setSubmitError(authError.message || "Signup fail ho gaya. Dobara try karein.");
        }
        setSubmitting(false);
        return;
      }

      // 2. Signup ke baad SEEDHA dashboard redirect — Google login trigger nahi
      // Clear existing td-user localStorage so onboarding flow starts fresh
      // and doesn't re-initiate Google auth unnecessarily after signup redirect
      clearUser();
      redirecting.current = true;
      window.location.href = "/";
    } catch (err: any) {
      console.log("Signup Error:", err.code, err.message);
      if (err instanceof Error && err.message === "Firebase not configured") {
        setSubmitError("Firebase configured nahi hai.");
      } else if (err.code === "permission-denied") {
        setSubmitError("Database mein save karne ki permission nahi hai. Firestore Rules check karein.");
      } else if (err.code === "auth/network-request-failed") {
        setSubmitError("Internet connection check karein.");
      } else {
        setSubmitError(err.message || "Signup fail ho gaya. Dobara try karein.");
      }
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (busy || !auth) return;
    setSubmitError(null);
    try {
      const user = await signInWithGoogle();
      clearUser();
      redirecting.current = true;
      window.location.href = "/";
    } catch (err) {
      console.error("[signup] Google error:", err);
      setSubmitError("Google sign-in fail ho gaya.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: BG }}>
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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: GREEN }}>
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-bold" style={{ color: TEXT }}>
          Create Account
        </h1>
        <p className="mb-7 text-center text-sm" style={{ color: MUTED }}>
          Join Trading Student Expert AI
        </p>

        {submitError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border p-3 text-center text-sm"
            style={{
              backgroundColor: "rgba(245,63,63,0.10)",
              borderColor: "rgba(245,63,63,0.35)",
              color: "#F87171",
            }}
          >
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Field label="Full Name" error={errors.name}>
            <Input
              type="text"
              value={form.name}
              onChange={handleChange("name")}
              placeholder="Enter your full name"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={handleChange("email")}
              placeholder="name@domain.com"
            />
          </Field>
          <Field label="Phone Number" error={errors.phone}>
            <Input
              type="tel"
              value={form.phone}
              onChange={handleChange("phone")}
              placeholder="+92 300 1234567"
            />
          </Field>
          <Field label="Age" error={errors.age}>
            <Input
              type="number"
              value={form.age}
              onChange={handleChange("age")}
              placeholder="18"
              min={13}
              max={100}
            />
          </Field>
          <Field label="City" error={errors.city}>
            <Input type="text" value={form.city} onChange={handleChange("city")} placeholder="Karachi" />
          </Field>
          <Field label="Country" error={errors.country}>
            <Input type="text" value={form.country} onChange={handleChange("country")} placeholder="Pakistan" />
          </Field>
          <Field label="Full Address" error={errors.fullAddress}>
            <Input
              type="text"
              value={form.fullAddress}
              onChange={handleChange("fullAddress")}
              placeholder="House #, Street, Area"
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input type="password" value={form.password} onChange={handleChange("password")} placeholder="••••••" />
          </Field>
          <Field label="Confirm Password" error={errors.confirmPassword}>
            <Input
              type="password"
              value={form.confirmPassword}
              onChange={handleChange("confirmPassword")}
              placeholder="Re-enter password"
            />
          </Field>
          <div className="mb-4 flex items-start gap-2">
            <input
              id="terms"
              type="checkbox"
              checked={form.terms}
              onChange={(e) => setForm((prev) => ({ ...prev, terms: e.target.checked }))}
              disabled={busy}
              style={{
                width: "1.1rem",
                height: "1.1rem",
                accentColor: GREEN,
                borderRadius: "0.25rem",
                border: `1px solid ${BORDER}`,
              }}
            />
            <label htmlFor="terms" className="text-sm" style={{ color: MUTED }}>
              I agree to Terms &amp; Privacy
            </label>
          </div>
          {errors.terms && <p className="mt-1 text-xs" style={{ color: RED }}>{errors.terms}</p>}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              marginTop: "1.25rem",
              padding: "0.85rem 1.5rem",
              background: GREEN,
              color: "white",
              border: "none",
              borderRadius: "0.75rem",
              fontWeight: 600,
              fontSize: "1rem",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
              transition: "background 0.15s",
            }}
          >
            {submitting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-center" style={{ gap: 16 }}>
          <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
          <span className="text-xs" style={{ color: MUTED }}>OR</span>
          <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          aria-label="Sign in with Google"
          style={{ width: "100%", marginTop: "0.5rem", padding: "0.85rem 1.5rem", background: "#FFFFFF", color: "#1F2937", border: `1px solid ${BORDER}`, borderRadius: "0.75rem", fontWeight: 600, fontSize: "1rem", cursor: busy ? "not-allowed" : "pointer", transition: "background 0.15s" }}
        >
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
            </svg>
          )}
          <span>{busy ? "Signing in..." : "Sign in with Google"}</span>
        </button>

        <p className="mt-5 text-center text-sm" style={{ color: MUTED }}>
          Already have an account?{" "}
          <a href="/login" className="font-medium text-green-500 hover:underline" style={{ color: GREEN }}>
            Sign In
          </a>
        </p>
        <p className="mt-4 text-center text-xs leading-relaxed" style={{ color: "#5C6470" }}>
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