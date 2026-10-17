"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, type AuthError } from "firebase/auth";
import { auth, db, COLLECTION_USERS, onAuthStateChanged } from "@/src/lib/firebase";
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
      if (user) router.push("/");
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
      const result = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await setDoc(doc(db, COLLECTION_USERS, result.user.uid), {
        uid: result.user.uid,
        name: form.name,
        email: form.email,
        phone: form.phone,
        age: form.age,
        city: form.city,
        country: form.country,
        fullAddress: form.fullAddress,
        createdAt: serverTimestamp(),
      });
      try {
        localStorage.setItem("onboarding-complete", "true");
      } catch {
        /* ignore quota / private-mode failures */
      }
      redirecting.current = true;
      router.push("/");
    } catch (err) {
      console.error("[signup] error:", err);
      const code = (err as AuthError | { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        setSubmitError("Email pehle se register hai. Sign In try karein.");
      } else if (code === "auth/invalid-email") {
        setSubmitError("Invalid email address.");
      } else if (code === "auth/weak-password") {
        setSubmitError("Password kam az kam 6 characters ka ho.");
      } else if (err instanceof Error && err.message === "Firebase not configured") {
        setSubmitError("Firebase configured nahi hai.");
      } else {
        setSubmitError("Signup fail ho gaya. Dobara try karein.");
      }
      setSubmitting(false);
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