import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Trading Student Expert AI",
  description:
    "Privacy Policy for Trading Student Expert AI. Educational analysis only. Not financial advice.",
};

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const AMBER = "#F0B90B";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/login" className="text-xs" style={{ color: GREEN }}>
        ← Back
      </Link>

      <div
        className="mt-4 rounded-2xl border p-6"
        style={{ backgroundColor: CARD, borderColor: BORDER }}
      >
        <h1 className="text-2xl font-bold" style={{ color: TEXT }}>
          Privacy Policy
        </h1>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Last updated: October 2026
        </p>

        <div
          className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: AMBER, color: AMBER, backgroundColor: "rgba(240,185,11,0.08)" }}
        >
          ⚠️ <strong>Educational analysis only. Not financial advice.</strong> We keep
          data collection minimal and never sell your information.
        </div>

        <section className="mt-6 space-y-5 text-sm leading-relaxed" style={{ color: MUTED }}>
          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              1. Information We Collect
            </h2>
            <p>
              When you sign in with Google or Facebook, we receive basic profile
              information (name, email, profile photo) to personalize your experience.
              We also store simple study preferences (e.g. completed onboarding, language
              choice) locally in your browser.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              2. How We Use Information
            </h2>
            <p>
              Your information is used only to operate and improve the Service — for
              example to show your name in the menu and remember your settings. We do{" "}
              <strong style={{ color: TEXT }}>not</strong> sell, rent, or trade your personal
              data.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              3. Authentication
            </h2>
            <p>
              Login is handled by Firebase Authentication (Google). Your credentials are
              managed by the provider; we never see or store your password.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              4. Third-Party Data
            </h2>
            <p>
              Market data is fetched from third-party exchange and data APIs. These
              providers have their own privacy policies and may collect technical data
              (such as IP address) as part of serving requests.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              5. Cookies &amp; Local Storage
            </h2>
            <p>
              We use browser local storage to remember preferences and keep you signed
              in. You can clear this at any time from your browser settings.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              6. Data Security
            </h2>
            <p>
              We take reasonable measures to protect your information, but no method of
              transmission or storage over the internet is 100% secure.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              7. Your Choices
            </h2>
            <p>
              You may sign out at any time. To request deletion of your account data,
              contact the creator,{" "}
              <strong style={{ color: TEXT }}>Muhammad Noman</strong>, via the AI chat on the
              site.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              8. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Updates will be
              reflected by the &quot;Last updated&quot; date above.
            </p>
          </div>
        </section>

        <p className="mt-6 text-center text-xs" style={{ color: MUTED }}>
          ⚠️ Educational only. Not financial advice.
        </p>
      </div>
    </main>
  );
}
