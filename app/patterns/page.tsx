"use client";

// Patterns menu — two big buttons linking to the candlestick and chart pattern
// libraries. Educational only. Not financial advice.
import Link from "next/link";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

export default function PatternsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Library</p>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: TEXT }}>📚 Patterns Library</h1>

      <div className="flex flex-col gap-4">
        <Link
          href="/candlestick"
          className="flex items-center gap-4 rounded-2xl border p-6 transition-colors hover:border-[#3b4252]"
          style={{ backgroundColor: CARD, borderColor: BORDER }}
        >
          <span className="text-4xl">🕯️</span>
          <div className="flex flex-col">
            <span className="text-lg font-bold" style={{ color: TEXT }}>Candlestick Patterns</span>
            <span className="text-sm" style={{ color: MUTED }}>30 single & multi-bar candle shapes</span>
          </div>
        </Link>

        <Link
          href="/chart-patterns"
          className="flex items-center gap-4 rounded-2xl border p-6 transition-colors hover:border-[#3b4252]"
          style={{ backgroundColor: CARD, borderColor: BORDER }}
        >
          <span className="text-4xl">📊</span>
          <div className="flex flex-col">
            <span className="text-lg font-bold" style={{ color: TEXT }}>Chart Patterns</span>
            <span className="text-sm" style={{ color: MUTED }}>25 reversal, continuation & harmonic shapes</span>
          </div>
        </Link>
      </div>

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational only. Not financial advice.
      </footer>
    </main>
  );
}
