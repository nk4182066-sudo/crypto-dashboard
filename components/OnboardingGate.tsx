"use client";

// Part 4 — onboarding gate. Holds the flow state (story → register → welcome →
// done) in a client component so app/layout.tsx can stay a server component
// (it exports metadata/viewport, which cannot live in a "use client" file).
// Persisted via localStorage so returning users skip straight to the app.
import { useState, useEffect } from "react";
import WelcomeStory from "@/components/WelcomeStory";
import RegistrationScreen from "@/components/RegistrationScreen";
import WelcomeScreen from "@/components/WelcomeScreen";

const COMPLETE_KEY = "onboarding-complete";

type Step = "loading" | "story" | "register" | "welcome" | "done";

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<Step>("loading");
  const [checked, setChecked] = useState(false);

  // Decide the starting step from localStorage (client-only).
  useEffect(() => {
    const complete = localStorage.getItem(COMPLETE_KEY) === "true";
    setStep(complete ? "done" : "story");
    setChecked(true);
  }, []);

  function finish() {
    try {
      localStorage.setItem(COMPLETE_KEY, "true");
    } catch {
      /* ignore quota / private-mode failures */
    }
    setStep("done");
  }

  // Before we know (SSR / first paint) show a black screen — no flash of app.
  if (!checked) return <div className="fixed inset-0 bg-black" />;

  if (step === "story") return <WelcomeStory onComplete={() => setStep("register")} />;

  if (step === "register") {
    return (
      <RegistrationScreen onComplete={() => setStep("welcome")} onSkip={finish} />
    );
  }

  if (step === "welcome") return <WelcomeScreen onComplete={finish} />;

  return <>{children}</>;
}
