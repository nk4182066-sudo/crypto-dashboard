import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Trading Student Expert AI",
  description:
    "Educational analysis only. Not financial advice. Terms of Service for Trading Student Expert AI.",
};

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const AMBER = "#F0B90B";

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Last updated: October 2026
        </p>

        <div
          className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: AMBER, color: AMBER, backgroundColor: "rgba(240,185,11,0.08)" }}
        >
          ⚠️ <strong>Educational analysis only. Not financial advice.</strong> Trading
          Student Expert AI provides educational market analysis, patterns, and study
          tools. It does NOT provide investment, financial, legal, or tax advice.
        </div>

        <section className="mt-6 space-y-5 text-sm leading-relaxed" style={{ color: MUTED }}>
          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using Trading Student Expert AI (&quot;the Service&quot;), you
              agree to be bound by these Terms. If you do not agree, please do not use
              the Service.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              2. Educational Purpose Only
            </h2>
            <p>
              All content — including market &quot;setups&quot;, scores, patterns, trend
              notes, and AI chat responses — is provided strictly for{" "}
              <strong style={{ color: TEXT }}>educational and informational</strong>{" "}
              purposes. Nothing here is a recommendation to buy, sell, or hold any
              asset, nor a guarantee of any result. Crypto, forex, stocks, and metals
              trading carry substantial risk of loss.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              3. No Financial Advice
            </h2>
            <p>
              We are not licensed financial advisors. You are solely responsible for
              your own trading and investment decisions. Always do your own research and
              consult a qualified professional before investing.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              4. Accuracy of Data
            </h2>
            <p>
              Market data is sourced from third-party providers (e.g. exchange and data
              APIs). While we strive for accuracy, we do not guarantee that data,
              prices, or analysis are complete, timely, or error-free. Data may be
              delayed or unavailable.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              5. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, Trading Student Expert AI and its
              creator shall not be liable for any direct, indirect, incidental, or
              consequential loss arising from your use of the Service or reliance on any
              content.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              6. User Accounts
            </h2>
            <p>
              You may sign in using Google or Facebook. You are responsible for
              maintaining the confidentiality of your account and for all activity under
              it.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              7. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service
              after changes constitutes acceptance of the updated Terms.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-bold" style={{ color: TEXT }}>
              8. Contact
            </h2>
            <p>
              Questions? Reach out to the creator, <strong style={{ color: TEXT }}>Muhammad Noman</strong>, through the
              AI chat on the site.
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
