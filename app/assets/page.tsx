"use client";

// Assets page — the app's "Tools Hub". One screen with three cards that open
// the pattern libraries and the Results/Tracking page. Keeps the same dark
// Bitget-style theme as the rest of the app. Educational only. Not advice.
import Link from "next/link";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

interface HubCard {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
}

const HUB_CARDS: HubCard[] = [
  {
    href: "/candlestick",
    icon: "🕯️",
    title: "Candlestick Patterns",
    subtitle: "30 single & multi-bar candle shapes",
  },
  {
    href: "/chart-patterns",
    icon: "📊",
    title: "Chart Patterns",
    subtitle: "25 reversal, continuation & harmonic shapes",
  },
  {
    href: "/results",
    icon: "📈",
    title: "Results & Tracking",
    subtitle: "Win/Loss record of every tracked setup",
    badge: "NEW",
  },
];

export default function AssetsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Tools Hub</p>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: TEXT }}>📚 Assets</h1>

      <div className="flex flex-col gap-4">
        {HUB_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex items-center gap-4 rounded-2xl border p-6 transition-colors hover:border-[#3b4252]"
            style={{ backgroundColor: CARD, borderColor: BORDER }}
          >
            <span className="text-4xl">{card.icon}</span>
            <div className="flex flex-1 flex-col">
              <span className="flex items-center gap-2 text-lg font-bold" style={{ color: TEXT }}>
                {card.title}
                {card.badge && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: GREEN, color: "#0B0E11" }}
                  >
                    {card.badge}
                  </span>
                )}
              </span>
              <span className="text-sm" style={{ color: MUTED }}>{card.subtitle}</span>
            </div>
            <span className="text-xl" style={{ color: MUTED }}>›</span>
          </Link>
        ))}
      </div>

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Not financial advice.
      </footer>
    </main>
  );
}
