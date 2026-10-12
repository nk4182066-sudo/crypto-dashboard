"use client";

// Auto analysis overlay for the trading chart. Educational only. Not financial advice.

import { useEffect, useState } from "react";
import { getChartAnalysis, type ChartAnalysis } from "@/src/lib/autoChartAnalysis";

interface ChartAnalysisOverlayProps {
  symbol: string;
  market: string;
  candles: { time: number; close: number }[];
  /** Pre-fetched analysis (TradingChart owns fetch when provided); otherwise this panel fetches itself. */
  analysis?: ChartAnalysis | null;
  error?: string | null;
}

const money = (value: number): string =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : 4 })}`;

const statusLabel: Record<ChartAnalysis["tradeStatus"], string> = { SETUP_FORMING: "SETUP FORMING", NO_SETUP: "NO SETUP", WATCH: "WATCH" };

const verdictEmoji: Record<ChartAnalysis["verdict"], string> = { STRONG: "✅", MODERATE: "⚠️", WEAK: "⭕" };

/** Score category shown at the top of the teacher-style analysis (Setup 4, Masla 1). */
function getScoreCategory(score: number): { label: string; emoji: string; color: string } {
  if (score >= 80) return { label: "Excellent", emoji: "🏆", color: "#00C087" };
  if (score >= 70) return { label: "Very Good", emoji: "⭐", color: "#7DD3A0" };
  if (score >= 60) return { label: "Good", emoji: "✅", color: "#F0B90B" };
  if (score >= 50) return { label: "Poor", emoji: "⚠️", color: "#FF9500" };
  return { label: "Weak", emoji: "❌", color: "#F6465D" };
}

/**
 * Structure trend from swing highs/lows (Setup 4, Masla 2):
 * higher highs + higher lows = Uptrend, lower highs + lower lows = Downtrend,
 * anything else = Sideways. Uses a simple 3-bar fractal pivot on the close series.
 */
function computeStructureTrend(closes: number[]): "Uptrend" | "Downtrend" | "Sideways" {
  if (closes.length < 6) return "Sideways";
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 1; i < closes.length - 1; i += 1) {
    if (closes[i] > closes[i - 1] && closes[i] >= closes[i + 1]) highs.push(closes[i]);
    if (closes[i] < closes[i - 1] && closes[i] <= closes[i + 1]) lows.push(closes[i]);
  }
  if (highs.length < 2 || lows.length < 2) return "Sideways";
  const higherHigh = highs[highs.length - 1] > highs[highs.length - 2];
  const higherLow = lows[lows.length - 1] > lows[lows.length - 2];
  const lowerHigh = highs[highs.length - 1] < highs[highs.length - 2];
  const lowerLow = lows[lows.length - 1] < lows[lows.length - 2];
  if (higherHigh && higherLow) return "Uptrend";
  if (lowerHigh && lowerLow) return "Downtrend";
  return "Sideways";
}

function toneOf(direction: ChartAnalysis["direction"]): { text: string; border: string; dot: string } {
  if (direction === "bullish") return { text: "text-emerald-400", border: "border-emerald-500/40", dot: "bg-emerald-500" };
  if (direction === "bearish") return { text: "text-rose-400", border: "border-rose-500/40", dot: "bg-rose-500" };
  return { text: "text-zinc-300", border: "border-zinc-700", dot: "bg-zinc-500" };
}

function Row({ label, value, className = "text-zinc-200" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className={`truncate text-right font-medium ${className}`}>{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="w-72 animate-pulse space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-3" role="status" aria-label="Loading analysis">
      <div className="h-3 w-2/3 rounded bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-800" />
      <div className="h-3 w-5/6 rounded bg-zinc-800" />
      <div className="h-3 w-1/2 rounded bg-zinc-800" />
    </div>
  );
}

export default function ChartAnalysisOverlay({ symbol, market, candles, analysis: injected, error: injectedError }: ChartAnalysisOverlayProps) {
  const [fetched, setFetched] = useState<{ symbol: string; data: ChartAnalysis | null; error: string | null }>({ symbol: "", data: null, error: null });
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Controlled mode: parent (TradingChart) owns the fetch. Standalone: fetch on symbol change + every 30s.
  const controlled = injected !== undefined;
  const fresh = fetched.symbol === symbol;
  const analysis = controlled ? injected : fresh ? fetched.data : null;
  const shownError = injectedError ?? (fresh ? fetched.error : null);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getChartAnalysis(symbol, market);
        if (!cancelled) setFetched({ symbol, data: result, error: null });
      } catch {
        if (!cancelled) setFetched({ symbol, data: null, error: "Analysis load nahi ho saki." });
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, market, controlled]);

  // Smooth fade-in when the panel first mounts (loading skeleton swaps to panel).
  useEffect(() => {
    const frame = window.setTimeout(() => setVisible(true), 30);
    return () => window.clearTimeout(frame);
  }, []);

  if (shownError && !analysis) {
    return (
      <div role="alert" className="w-72 rounded-lg border border-rose-500/40 bg-zinc-950/95 p-3 text-xs text-rose-300">
        <p className="font-semibold">⚠️ Analysis unavailable</p>
        <p className="mt-1 text-rose-200/80">{shownError}</p>
      </div>
    );
  }
  if (!analysis) return <Skeleton />;

  const tone = toneOf(analysis.direction);
  const bullish = analysis.direction === "bullish";
  const isBearish = analysis.direction === "bearish";
  const topPatterns = analysis.patterns.slice(0, 3);

  // ---- Setup 4: teacher-style derived values -----------------------------
  const currentPrice = candles.at(-1)?.close ?? analysis.currentPrice;
  const support = analysis.support;
  const resistance = analysis.resistance;
  const category = getScoreCategory(analysis.score);

  // Masla 2 — structure trend from higher-highs / higher-lows (Masla 2).
  const structureTrend = computeStructureTrend(candles.map((c) => c.close));
  const trendLabel =
    structureTrend === "Sideways"
      ? bullish ? "Uptrend" : isBearish ? "Downtrend" : "Sideways"
      : structureTrend;
  const trendHint =
    trendLabel === "Uptrend"
      ? "(higher highs / higher lows)"
      : trendLabel === "Downtrend"
        ? "(lower highs / lower lows)"
        : "(no clear structure)";
  const topPattern = topPatterns[0]?.name ?? "No clear pattern";

  // Masla 3 — two entry points (aggressive / conservative), direction-aware.
  const entryAggressive = isBearish ? currentPrice * 0.999 : currentPrice * 1.001;
  const entryConservative = isBearish
    ? resistance - (resistance - currentPrice) * 0.3
    : support + (currentPrice - support) * 0.3;

  // Masla 4 — stop loss + 3 targets with R:R, anchored on the aggressive entry.
  const stopLoss = isBearish ? resistance * 1.003 : support * 0.997;
  const risk = Math.abs(entryAggressive - stopLoss);
  const riskPct = entryAggressive > 0 ? (risk / entryAggressive) * 100 : 0;
  const targetAt = (multiplier: number) =>
    isBearish ? entryAggressive - risk * multiplier : entryAggressive + risk * multiplier;
  const targets = [
    { label: "TP1", price: targetAt(1.25), rr: "1:1.25" },
    { label: "TP2", price: targetAt(2.5), rr: "1:2.5" },
    { label: "TP3", price: targetAt(4.4), rr: "1:4.4" },
  ];

  // Masla 5 — why bullish / bearish (Roman Urdu + English).
  const rsi = analysis.indicators.rsi;
  const rsiWord = rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "healthy";
  const macd = analysis.indicators.macd;
  const volumeWord = analysis.indicators.volume;
  const directionWord = bullish ? "BULLISH" : isBearish ? "BEARISH" : "NEUTRAL";
  const nearResistance = resistance > 0 && Math.abs(currentPrice - resistance) / resistance < 0.01;
  const whyRoman =
    `${analysis.symbol} ne ${money(support)} pe support liya. ` +
    `${topPattern} pattern bana. ` +
    `${nearResistance ? `Price ${money(resistance)} resistance ke qareeb hai. ` : `Breakout ${money(resistance)} ki taraf hai. `}` +
    `RSI ${rsi} ${rsiWord}. Volume ${volumeWord}. MACD ${macd}. Trend ${trendLabel.toLowerCase()}.`;
  const whyEnglish =
    `${analysis.symbol} respected support at ${money(support)} and formed a ${topPattern}. ` +
    `${nearResistance ? `Price is near resistance at ${money(resistance)}. ` : `A move toward ${money(resistance)} is in play. `}` +
    `RSI is ${rsi} (${rsiWord}), volume is ${volumeWord}, and MACD is ${macd}. Structure is ${trendLabel.toLowerCase()}.`;

  // Masla 6 — reversal warnings (auto-generated from live levels + indicators).
  const warnings: string[] = [];
  if (support > 0 && currentPrice < support) warnings.push(`Price ${money(support)} support se neeche — setup fail ho sakta hai.`);
  if (resistance > 0 && nearResistance) warnings.push(`Price ${money(resistance)} resistance ke qareeb — rejection possible.`);
  if (rsi > 70) warnings.push(`RSI ${rsi} overbought (>70) — careful, pullback aa sakta hai.`);
  if (rsi < 30) warnings.push(`RSI ${rsi} oversold (<30) — bounce possible.`);
  if (isBearish && resistance > 0 && currentPrice > resistance) warnings.push(`Price ${money(resistance)} cross kar gaya — short setup fail.`);
  if (warnings.length === 0) warnings.push("Filhaal koi khaas reversal setup nahi — lekin SL zaroori hai.");

  // Masla 6 — teacher notes (practical Roman Urdu advice).
  const teacherNotes = [
    "Ye setup strong lekin risk bhi hai — 2 entries use karo, sab ek baar mein mat lagao.",
    `Stop loss ${money(stopLoss)} ke peeche zaroor rakho — bina SL trade galat baat hai.`,
    "TP1 pe thora profit book karlo, baaki ko trail karlo — yehi disciplined trading hai.",
  ];

  return (
    <section
      aria-label={`${analysis.symbol} auto analysis`}
      className={`w-[22rem] max-w-[calc(100vw-1rem)] max-h-[80vh] overflow-y-auto rounded-lg border ${tone.border} bg-zinc-950/95 shadow-xl backdrop-blur transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
    >
      <header className={`sticky top-0 z-10 flex items-center justify-between gap-2 border-b ${tone.border} bg-zinc-900/95 px-3 py-2 backdrop-blur`}>
        <h3 className="truncate text-xs font-bold text-white">🎯 {analysis.symbol} DETAILED ANALYSIS</h3>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand analysis panel" : "Minimize analysis panel"}
          className="rounded border border-zinc-700 px-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          {collapsed ? "+" : "–"}
        </button>
      </header>
      {!collapsed && (
        <div className="space-y-3 px-3 py-3 text-[11px] leading-snug text-zinc-200">

          {/* ---- Masla 1: Direction + Score + Category ---- */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Direction:</span>
              <span className="font-bold" style={{ color: bullish ? "#00C087" : isBearish ? "#F6465D" : "#848E9C" }}>
                {directionWord}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-400">Score:</span>
              <span className="font-bold" style={{ color: category.color }}>
                {analysis.score}/100 {category.emoji} {category.label}
              </span>
            </div>
          </div>

          {/* ---- Masla 2: Pattern + Trend ---- */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-zinc-400">Pattern:</span>
              <span className="truncate text-right font-semibold text-zinc-100">{topPattern}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-400">Trend:</span>
              <span className="font-semibold" style={{ color: trendLabel === "Uptrend" ? "#00C087" : trendLabel === "Downtrend" ? "#F6465D" : "#F0B90B" }}>
                {trendLabel}
              </span>
            </div>
            <p className="mt-0.5 text-right text-[10px] text-zinc-500">{trendHint}</p>
          </div>

          {/* ---- Masla 3: Two Entry Points ---- */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <p className="mb-1.5 font-bold text-emerald-300">🎯 ENTRY POINTS</p>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">Entry 1 <span className="text-zinc-500">(aggressive)</span></span>
              <span className="font-bold text-emerald-400">{money(entryAggressive)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-300">Entry 2 <span className="text-zinc-500">(conservative)</span></span>
              <span className="font-bold text-emerald-400">{money(entryConservative)}</span>
            </div>
          </div>

          {/* ---- Masla 4: Stop Loss + 3 Targets ---- */}
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5">
            <p className="mb-1.5 font-bold text-rose-300">🛑 STOP LOSS</p>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">SL</span>
              <span className="font-bold text-rose-400">{money(stopLoss)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-zinc-500">Risk</span>
              <span className="text-zinc-300">{money(risk)} ({riskPct.toFixed(2)}%)</span>
            </div>
          </div>

          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5">
            <p className="mb-1.5 font-bold text-sky-300">🎯 TARGETS (3)</p>
            {targets.map((target) => (
              <div key={target.label} className="flex items-center justify-between">
                <span className="text-zinc-300">{target.label}</span>
                <span className="font-bold text-sky-300">
                  {money(target.price)} <span className="text-[10px] text-zinc-500">({target.rr} R:R)</span>
                </span>
              </div>
            ))}
          </div>

          {/* ---- Masla 5: Why Bullish / Bearish (Roman Urdu + English) ---- */}
          <div className={`rounded-lg border p-2.5 ${tone.border} ${tone.text}`}>
            <p className="mb-1.5 font-bold">
              {bullish ? "📈 WHY BULLISH?" : isBearish ? "📉 WHY BEARISH?" : "📊 WHY NEUTRAL?"}
            </p>
            <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Roman Urdu</p>
            <p className="whitespace-pre-line text-zinc-300">{whyRoman}</p>
            <p className="mb-1 mt-2 text-[10px] font-semibold uppercase text-zinc-500">English</p>
            <p className="whitespace-pre-line text-zinc-400">{whyEnglish}</p>
          </div>

          {/* ---- Masla 6: Reversal Warning + Teacher Notes ---- */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="mb-1.5 font-bold text-amber-300">⚠️ REVERSAL WARNING</p>
            <ul className="space-y-1 text-zinc-300">
              {warnings.map((warning) => (
                <li key={warning} className="flex gap-1.5">
                  <span className="shrink-0 text-amber-400">•</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
            <p className="mb-1.5 font-bold text-zinc-100">🎓 TEACHER NOTES</p>
            <ul className="space-y-1 text-zinc-300">
              {teacherNotes.map((note) => (
                <li key={note} className="flex gap-1.5">
                  <span className="shrink-0 text-emerald-400">›</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="border-t border-zinc-800 pt-2 text-center text-[10px] text-zinc-500">📚 Educational only · Not financial advice</p>
        </div>
      )}
    </section>
  );
}


