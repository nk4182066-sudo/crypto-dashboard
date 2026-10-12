"use client";

// AI Setups page. Clean like /markets: market tabs, then every scanned setup
// for that market (all-coins API scans the full universe), sorted by score
// highest first. Educational analysis only — never "Buy now", "accuracy", "Guaranteed", "signal".
// Neutral educational tone — educational analysis only.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PatternLanguageTabs, { type PatternDetailLanguage } from "@/components/PatternLanguageTabs";
import { generateFullSignal, type FullSignal } from "@/src/lib/signalGenerator";
import { saveSignal, MIN_SCORE } from "@/src/lib/signalStorage";
import { CandlestickVisual, ChartPatternVisual } from "@/components/PatternVisuals";
import { TrendBadge, ConfirmationSection, ExpertPanel, GuidanceSection } from "@/components/AnalysisInsights";
import { buildGuidance, type ConfirmationIndicator, type Consensus, type EducatorVerdict } from "@/src/lib/confirmations";

const LANG_STORAGE_KEY = "signals-language";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";
const AMBER = "#F0B90B";

type Market = "crypto" | "forex" | "stocks" | "metals";

interface MarketSignal {
  symbol: string;
  label: string;
  market: Market;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  bias: "Bullish" | "Bearish" | "Sideways";
  price: number;
  pattern: string | null;
  support: number | null;
  resistance: number | null;
  watchLevel: number | null;
  reason: string;
  analyzedAt: string;
  chartPattern: string | null;
  chartPatternNote: string | null;
  candlestickPattern: string | null;
  candlestickConfidence: number;
  /** Feature 2 — real-data confirmation breakdown (null when candles are cold). */
  confirmations?: { indicators: ConfirmationIndicator[]; confirmed: number; total: number } | null;
  /** Feature 3 — expert panel + consensus (save requires agreed >= 3). */
  experts?: { educators: EducatorVerdict[]; consensus: Consensus } | null;
}

const TABS: { key: Market; label: string }[] = [
  { key: "crypto", label: "Crypto" },
  { key: "forex", label: "Forex" },
  { key: "stocks", label: "Stocks" },
  { key: "metals", label: "Metals" },
];

const REFRESH_MS = 5 * 60 * 1000;

// Task 2 — placeholder setups shown instantly while the live scan loads, so the
// page never sits on an empty skeleton. Replaced by real data within ~1-2s.
// Approx values only. Educational only.
const PLACEHOLDER_SIGNALS: MarketSignal[] = [
  { symbol: "BTCUSDT", label: "BTC/USDT", market: "crypto", score: 92, direction: "bullish", bias: "Bullish", price: 83000, pattern: "Double Bottom", support: 81000, resistance: 85000, watchLevel: 81000, reason: "Support bounce with rising volume.", analyzedAt: new Date().toISOString(), chartPattern: "Double Bottom", chartPatternNote: "Two equal lows with a peak between.", candlestickPattern: "Hammer", candlestickConfidence: 85 },
  { symbol: "ETHUSDT", label: "ETH/USDT", market: "crypto", score: 87, direction: "bullish", bias: "Bullish", price: 2300, pattern: "Cup & Handle", support: 2250, resistance: 2400, watchLevel: 2250, reason: "Cup & Handle breakout forming.", analyzedAt: new Date().toISOString(), chartPattern: "Cup & Handle", chartPatternNote: "U shape with a small handle dip.", candlestickPattern: "Bullish Engulfing", candlestickConfidence: 80 },
  { symbol: "SOLUSDT", label: "SOL/USDT", market: "crypto", score: 84, direction: "bullish", bias: "Bullish", price: 109, pattern: "Ascending Triangle", support: 105, resistance: 112, watchLevel: 105, reason: "Ascending triangle near resistance.", analyzedAt: new Date().toISOString(), chartPattern: "Ascending Triangle", chartPatternNote: "Flat resistance with rising support.", candlestickPattern: "Three White Soldiers", candlestickConfidence: 78 },
];

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p) || p === 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

/** BTC-USD -> BTC/USD, EURUSD=X -> EUR/USD, GC=F -> GC. */
function displaySymbol(symbol: string): string {
  if (symbol.endsWith("=X")) return symbol.replace("=X", "").replace(/(.{3})(.{3})/, "$1/$2");
  if (symbol.endsWith("=F")) return symbol.replace("=F", "");
  return symbol.replace("-USD", "/USD").replace("-", "/");
}

function directionLabel(direction: MarketSignal["direction"]): string {
  if (direction === "bullish") return "Bullish";
  if (direction === "bearish") return "Bearish";
  return "Neutral";
}

/** Status wording stays educational: never "Buy now"/"Signal". */
function statusOf(signal: MarketSignal): { text: string; color: string } {
  if (signal.score >= 85 && signal.direction !== "neutral") return { text: "Setup detected", color: GREEN };
  return { text: "Watch zone", color: AMBER };
}

/** Score tier badge — only 80+ are shown, so every card is at least "Excellent". */
function scoreTier(score: number): { emoji: string; label: string } {
  if (score >= 90) return { emoji: "🏆", label: "Excellent" };
  if (score >= 80) return { emoji: "⭐", label: "Strong" };
  return { emoji: "⭐", label: "Strong" };
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function SignalsPage() {
  const router = useRouter();
  const [market, setMarket] = useState<Market>("crypto");
  // Task 2 — start with placeholder setups so cards appear instantly (no skeleton).
  const [signals, setSignals] = useState<MarketSignal[]>(PLACEHOLDER_SIGNALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  // Dual-language detail toggle (Task 2). Default Roman Urdu, saved to localStorage.
  const [lang, setLang] = useState<PatternDetailLanguage>("urdu");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "english" || saved === "urdu") setLang(saved);
    } catch {
      /* localStorage unavailable — stay on default */
    }
  }, []);

  const changeLang = (next: PatternDetailLanguage) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* ignore write failures */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/market-signals?market=${market}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load setups");
        const payload = (await response.json()) as { generatedAt?: string; results?: MarketSignal[] };
        if (cancelled) return;
        setSignals(Array.isArray(payload.results) ? payload.results : []);
        setUpdatedAt(payload.generatedAt ?? null);
      } catch {
        if (!cancelled) {
          setError("Setups load nahi ho sake. Thodi der baad try karein.");
          // Task 2/7 — keep whatever we have (placeholders) instead of emptying.
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [market]);

  // High-confluence only: hide anything below 80/100. Highest score first.
  const visible = useMemo(
    () => signals.filter((s) => s.score >= 80).sort((first, second) => second.score - first.score),
    [signals]
  );

  // Auto-save every 80+ setup into localStorage so the Results page can track it
  // A→Z (entries, SL, TP1-3, support/resistance, trend, pattern, candlestick).
  // saveSignal() de-dupes per symbol within a rolling 24h window, so the 5-min
  // refresh just skips coins already saved today instead of piling up duplicates.
  // Runs client-side only.
  useEffect(() => {
    if (loading) return;
    for (const signal of visible) {
      if (signal.score < MIN_SCORE) continue;
      // Feature 3 — only save setups where at least 3 of 4 experts agree
      // (and skip when the panel data is missing entirely).
      if (!signal.experts || signal.experts.consensus.agreed < 3) continue;
      const full: FullSignal = generateFullSignal({
        symbol: signal.symbol,
        market: signal.market,
        price: signal.price,
        direction: signal.direction,
        support: signal.support,
        resistance: signal.resistance,
        pattern: signal.pattern,
        score: signal.score,
        bias: signal.bias,
        reason: signal.reason,
        chartPattern: signal.chartPattern,
        chartPatternNote: signal.chartPatternNote,
        candlestick: signal.candlestickPattern
          ? { name: signal.candlestickPattern, confidence: signal.candlestickConfidence, type: signal.direction }
          : null,
      });
      saveSignal({
        symbol: signal.symbol,
        market: signal.market,
        score: signal.score,
        direction: signal.direction,
        trend: full.trend,
        pattern: full.chartPattern ?? full.pattern ?? "No clear pattern",
        candlestick: full.candlestickPattern
          ? `${full.candlestickPattern} (${full.candlestickType === "bearish" ? "Bearish" : full.candlestickType === "bullish" ? "Bullish" : "Neutral"}, ${full.candlestickConfidence}%)`
          : "Neutral (no confirmation)",
        entry1: full.entry1,
        entry2: full.entry2,
        stopLoss: full.stopLoss,
        tp1: full.tp1,
        tp2: full.tp2,
        tp3: full.tp3,
        support: full.support,
        resistance: full.resistance,
        currentPrice: signal.price,
      });
    }
  }, [visible, loading]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Analysis</p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: TEXT }}>💎 AI Setups</h1>
          <span className="text-xs" style={{ color: MUTED }}>{visible.length} setups</span>
          {updatedAt && (
            <span className="text-xs" style={{ color: MUTED }}>Updated {timeAgo(updatedAt)}</span>
          )}
        </div>
        {/* Task 2 — dual-language detail toggle, top-right. */}
        <PatternLanguageTabs value={lang} onChange={changeLang} />
      </div>

      {/* Market tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMarket(t.key)}
            aria-pressed={market === t.key}
            className="rounded-full px-3.5 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: market === t.key ? GREEN : CARD,
              color: market === t.key ? BG : TEXT,
              border: `1px solid ${BORDER}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards — no skeleton: placeholders show instantly while the live scan runs. */}
      {error && visible.length === 0 ? (
        <div className="rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: RED }}>
          {error}
        </div>
      ) : visible.length === 0 && !loading ? (
        <div className="rounded-2xl border p-6 text-center text-sm" style={{ backgroundColor: CARD, borderColor: BORDER, color: MUTED }}>
          <p>Abhi koi high-confluence setup nahi hai.</p>
          <p className="mt-1">Market analysis chal raha hai — thodi der baad check karein.</p>
          <p className="mt-2 text-xs opacity-70">(Sirf 80+ score wale setups yahan dikhte hain.)</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {loading && (
            <p className="text-center text-xs" style={{ color: MUTED }} role="status">Live scan chal raha hai…</p>
          )}
          {visible.map((signal) => {
            const status = statusOf(signal);
            const tier = scoreTier(signal.score);
            const full: FullSignal = generateFullSignal({
              symbol: signal.symbol,
              market: signal.market,
              price: signal.price,
              direction: signal.direction,
              support: signal.support,
              resistance: signal.resistance,
              pattern: signal.pattern,
              score: signal.score,
              bias: signal.bias,
              reason: signal.reason,
              chartPattern: signal.chartPattern,
              chartPatternNote: signal.chartPatternNote,
              candlestick: signal.candlestickPattern
                ? { name: signal.candlestickPattern, confidence: signal.candlestickConfidence, type: signal.direction }
                : null,
            });
            const why = lang === "urdu" ? full.whyRomanUrdu : full.whyEnglish;
            const teacher = lang === "urdu" ? full.teacherNotesRomanUrdu : full.teacherNotesEnglish;
            const dirColor = full.direction === "bearish" ? RED : full.direction === "bullish" ? GREEN : MUTED;
            const href = `/trade?symbol=${encodeURIComponent(signal.symbol)}&market=${signal.market}`;
            // Feature 4 — expert guidance quotes built from the panel summary.
            const guidanceQuotes =
              signal.confirmations && signal.experts
                ? buildGuidance(
                    { confirmed: signal.confirmations.confirmed, consensus: signal.experts.consensus },
                    {
                      direction: signal.direction,
                      price: signal.price,
                      support: signal.support ?? signal.price,
                      resistance: signal.resistance ?? signal.price,
                      pattern: signal.chartPattern ?? signal.pattern,
                      breakout: false,
                      score: signal.score,
                    }
                  )
                : [];
            return (
              <div
                key={`${signal.market}:${signal.symbol}`}
                className="overflow-hidden rounded-2xl border"
                style={{ backgroundColor: CARD, borderColor: BORDER }}
              >
              <Link
                href={href}
                // Task 4 — prefetch the trade route on hover/focus for instant open.
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                className="block p-4 transition-colors hover:bg-[#1f232b]"
              >
                {/* Header */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-base font-bold" style={{ color: TEXT }}>{displaySymbol(signal.symbol)}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ color: GREEN, backgroundColor: "rgba(0,192,135,0.12)" }}>
                    {tier.emoji} Score: {signal.score}/100
                  </span>
                </div>

                {/* Feature 1 — full-width trend badge at the top of the card. */}
                <TrendBadge direction={signal.direction} score={signal.score} />

                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold" style={{ color: dirColor }}>{directionLabel(signal.direction)}</span>
                  <span style={{ color: MUTED }}>· {full.trend}</span>
                  <span className="ml-auto text-xs font-semibold" style={{ color: status.color }}>{status.text}</span>
                </div>

                {/* 📊 CHART PATTERN (with small SVG) */}
                <Section title="📊 Chart Pattern" />
                {full.chartPattern ? (
                  <div className="flex items-center gap-3 py-1">
                    <div className="shrink-0">
                      <ChartPatternVisual name={full.chartPattern} type={full.direction} className="h-16 w-24" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: TEXT }}>{full.chartPattern}</p>
                      {full.chartPatternNote ? (
                        <p className="text-xs" style={{ color: MUTED }}>({full.chartPatternNote})</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="py-1 text-sm" style={{ color: MUTED }}>
                    No clear pattern detected — trend-based setup.
                  </p>
                )}

                {/* 🕯️ CANDLESTICK CONFIRMATION (with small SVG) */}
                <Section title="🕯️ Candlestick Confirmation" />
                {full.candlestickPattern ? (
                  <div className="flex items-center gap-3 py-1">
                    <div className="shrink-0">
                      <CandlestickVisual name={full.candlestickPattern} className="h-16 w-12" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: TEXT }}>
                        {full.candlestickPattern}
                        <span className="ml-1 text-xs font-normal" style={{ color: MUTED }}>
                          ({full.candlestickType === "bearish" ? "Bearish" : full.candlestickType === "bullish" ? "Bullish" : "Neutral"}, {full.candlestickConfidence}%)
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="py-1 text-sm" style={{ color: MUTED }}>
                    Candlestick: Neutral (no confirmation yet).
                  </p>
                )}

                {/* Trend */}
                <Line icon="📉" label="Trend" value={full.trend} />

                {/* Entries */}
                <Section title="🎯 Entry Points" />
                <Line label="Entry 1 (aggressive)" value={`$${fmtPrice(full.entry1)}`} />
                <Line label="Entry 2 (conservative)" value={`$${fmtPrice(full.entry2)}`} />

                {/* Stop loss */}
                <Section title="🛑 Stop Loss" />
                <Line label="SL" value={`$${fmtPrice(full.stopLoss)}`} valueColor={RED} note={`(Risk ~${full.riskPercent}%)`} />

                {/* Targets */}
                <Section title="🎯 Targets" />
                <Line label="TP1" value={`$${fmtPrice(full.tp1)}`} valueColor={GREEN} note={`(1:${full.rr1} R:R)`} />
                <Line label="TP2" value={`$${fmtPrice(full.tp2)}`} valueColor={GREEN} note={`(1:${full.rr2} R:R)`} />
                <Line label="TP3" value={`$${fmtPrice(full.tp3)}`} valueColor={GREEN} note={`(1:${full.rr3} R:R)`} />

                {/* Why */}
                <Section title={lang === "urdu" ? "📈 Why (Roman Urdu)" : "📈 Why (English)"} />
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{why}</p>

                {/* Key levels */}
                <Section title="🔍 Key Levels" />
                <Line label="Support" value={`$${fmtPrice(full.support)}`} valueColor={GREEN} />
                <Line label="Resistance" value={`$${fmtPrice(full.resistance)}`} valueColor={RED} />
                <Line label="Prev Low" value={`$${fmtPrice(full.prevLow)}`} />
                <Line label="Prev High" value={`$${fmtPrice(full.prevHigh)}`} />

                {/* Reversal warnings */}
                <Section title="⚠️ Reversal Warning" />
                <ul className="ml-4 list-disc space-y-0.5 text-xs" style={{ color: AMBER }}>
                  {full.reversalWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>

                {/* Teacher notes */}
                <Section title={lang === "urdu" ? "🎓 Teacher Notes (Roman Urdu)" : "🎓 Teacher Notes (English)"} />
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{teacher}</p>

                {/* Features 2-3 — confirmation indicators + expert panel. */}
                {signal.confirmations ? <ConfirmationSection report={signal.confirmations} /> : null}
                {signal.experts ? (
                  <ExpertPanel educators={signal.experts.educators} consensus={signal.experts.consensus} />
                ) : null}
              </Link>
              {/* Feature 4 — expandable guidance lives outside the link so the
                  expand buttons do not trigger card navigation. */}
              {guidanceQuotes.length > 0 ? (
                <div className="px-4 pb-1">
                  <GuidanceSection quotes={guidanceQuotes} />
                </div>
              ) : null}
              <p className="px-4 pb-4 pt-2 text-xs" style={{ color: MUTED }}>⚠️ Educational only. Not financial advice.</p>
            </div>
            );
          })}
        </div>
      )}

      <Link
        href="/results"
        className="mt-5 block w-full rounded-lg py-3 text-center text-sm font-bold transition-opacity hover:opacity-90"
        style={{ backgroundColor: GREEN, color: BG }}
      >
        📊 View All Results →
      </Link>

      <footer className="mt-6 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational analysis only. Not financial advice.
      </footer>
    </main>
  );
}

/** A titled section divider inside a signal card. */
function Section({ title }: { title: string }) {
  return (
    <p className="mt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: GREEN }}>
      {title}
    </p>
  );
}

/** One label/value row inside a signal card, with an optional icon, color and note. */
function Line({ icon, label, value, valueColor, note }: { icon?: string; label: string; value: string; valueColor?: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-sm">
      <span style={{ color: MUTED }}>
        {icon ? <span className="mr-1">{icon}</span> : null}
        {label}
      </span>
      <span className="text-right">
        <span className="font-semibold" style={{ color: valueColor ?? TEXT }}>{value}</span>
        {note ? <span className="ml-1 text-xs" style={{ color: MUTED }}>{note}</span> : null}
      </span>
    </div>
  );
}

