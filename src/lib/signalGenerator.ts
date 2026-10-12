/**
 * Task 3 — full educational trade-plan generator.
 *
 * Takes a scanned market signal's core numbers (price, direction, support,
 * resistance, pattern) and deterministically derives a complete, teacher-style
 * plan: two entries, stop loss, three targets, risk %, R:R per target, key
 * levels, a bilingual "why", reversal warnings and teacher notes.
 *
 * Synchronous and works purely from the supplied numbers so the Signals page
 * renders every card instantly (< 500ms) with no second network call per symbol.
 * Educational analysis only — not financial advice.
 */

import type { Candle } from "@/src/analysis/types";
import { scanCandlestickPatterns } from "@/src/lib/chart/candlestickPatterns";

export type SignalDirection = "bullish" | "bearish" | "neutral";

/** A detected candlestick confirmation on the most recent bars. */
export interface CandlestickDetection {
  name: string;
  confidence: number;
  type: "bullish" | "bearish" | "neutral";
}

/**
 * Detects the most relevant high-confidence candlestick pattern from the tail of
 * a candle series. Only hits at 70%+ confidence are considered (Rule: high
 * confidence only); the most recent qualifying hit wins so it reflects the
 * latest confirmation. Returns null when nothing qualifies.
 */
export function detectCandlestickPattern(candles: Candle[] | undefined | null): CandlestickDetection | null {
  if (!Array.isArray(candles) || candles.length < 3) return null;
  const hits = scanCandlestickPatterns(candles.slice(-12), 12);
  const strong = hits.filter((hit) => hit.confidence >= 70);
  if (strong.length === 0) return null;
  // Most recent by time; ties broken by higher confidence.
  const best = strong.reduce((a, b) => (b.time > a.time || (b.time === a.time && b.confidence > a.confidence) ? b : a));
  return { name: best.pattern, confidence: best.confidence, type: best.type };
}

export interface FullSignalInput {
  symbol: string;
  market: string;
  price: number;
  direction: SignalDirection;
  support: number | null;
  resistance: number | null;
  pattern?: string | null;
  score?: number;
  bias?: string | null;
  reason?: string | null;
  /** Detected chart (classical) pattern name, if any. */
  chartPattern?: string | null;
  /** Short note for the chart pattern, if any. */
  chartPatternNote?: string | null;
  /** Detected candlestick confirmation, if any. */
  candlestick?: CandlestickDetection | null;
}

export interface FullSignal {
  symbol: string;
  market: string;
  score: number;
  direction: SignalDirection;
  pattern: string | null;
  /** Detected chart (classical) pattern name, or null. */
  chartPattern: string | null;
  /** Short note for the chart pattern, or null. */
  chartPatternNote: string | null;
  /** Detected candlestick confirmation name, or null. */
  candlestickPattern: string | null;
  /** Candlestick confirmation confidence 0-100 (0 when none). */
  candlestickConfidence: number;
  /** Candlestick confirmation direction, or null. */
  candlestickType: "bullish" | "bearish" | "neutral" | null;
  /** One-line pattern explanation (Roman Urdu). */
  patternReason: string;
  trend: string;
  entry1: number;
  entry2: number;
  stopLoss: number;
  riskPercent: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr1: number;
  rr2: number;
  rr3: number;
  support: number;
  resistance: number;
  prevHigh: number;
  prevLow: number;
  whyRomanUrdu: string;
  whyEnglish: string;
  reversalWarnings: string[];
  teacherNotesRomanUrdu: string;
  teacherNotesEnglish: string;
}

/** Round a price to a sensible number of decimals for its magnitude. */
function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 1000) return Math.round(value * 100) / 100;
  if (value >= 1) return Math.round(value * 1000) / 1000;
  return Math.round(value * 100000) / 100000;
}

function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function trendOf(direction: SignalDirection, bias?: string | null): string {
  const b = (bias ?? "").toLowerCase();
  if (direction === "bearish") return "Downtrend (Lower Highs / Lower Lows)";
  if (direction === "bullish") return "Uptrend (Higher Highs / Higher Lows)";
  if (b.includes("bull")) return "Uptrend (Higher Highs / Higher Lows)";
  if (b.includes("bear")) return "Downtrend (Lower Highs / Lower Lows)";
  return "Sideways / Range";
}

/**
 * Builds the full educational signal. Math follows the requested spec:
 * - Entry 1 (aggressive): price ± 0.5%
 * - Entry 2 (conservative): near support (bullish) / resistance (bearish)
 * - SL: support × 0.997 (bullish) or resistance × 1.003 (bearish)
 * - TP1/2/3: entry ± risk × 1.3 / 2.5 / 4.0
 * - R:R per target = reward / risk
 */
export function generateFullSignal(input: FullSignalInput): FullSignal {
  const { symbol, market, direction, pattern = null, score = 0, bias, reason } = input;
  const price = Number.isFinite(input.price) && input.price > 0 ? input.price : 0;

  // Resolve chart + candlestick patterns (Rule 1: pattern should not be empty;
  // we always return a value or a clear fallback string).
  const chartPattern = input.chartPattern ?? pattern ?? null;
  const chartPatternNote = input.chartPatternNote ?? null;
  const candle = input.candlestick ?? null;
  const candlestickPattern = candle?.name ?? null;
  const candlestickConfidence = candle?.confidence ?? 0;
  const candlestickType = candle?.type ?? null;

  // Derive support / resistance so they are never empty (Rule 5).
  const support = input.support && input.support > 0 ? input.support : roundPrice(price * 0.97);
  const resistance = input.resistance && input.resistance > 0 ? input.resistance : roundPrice(price * 1.03);

  const bullish = direction === "bullish";
  const bearish = direction === "bearish";

  let entry1: number;
  let entry2: number;
  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let tp3: number;

  if (bearish) {
    entry1 = roundPrice(price * 0.995);
    entry2 = roundPrice(resistance);
    stopLoss = roundPrice(resistance * 1.003);
    const risk = Math.max(stopLoss - entry1, entry1 * 0.005);
    tp1 = roundPrice(entry1 - risk * 1.3);
    tp2 = roundPrice(entry1 - risk * 2.5);
    tp3 = roundPrice(entry1 - risk * 4.0);
  } else {
    entry1 = roundPrice(price * 1.005);
    entry2 = roundPrice(support);
    stopLoss = roundPrice(support * 0.997);
    const risk = Math.max(entry1 - stopLoss, entry1 * 0.005);
    tp1 = roundPrice(entry1 + risk * 1.3);
    tp2 = roundPrice(entry1 + risk * 2.5);
    tp3 = roundPrice(entry1 + risk * 4.0);
  }

  const riskAbs = Math.abs(entry1 - stopLoss) || 1;
  const rr = (tp: number) => Math.round((Math.abs(tp - entry1) / riskAbs) * 10) / 10;
  const riskPercent = Math.round((riskAbs / (entry1 || 1)) * 1000) / 10;

  const dirWord = bearish ? "Bearish" : bullish ? "Bullish" : "Neutral";
  const trend = trendOf(direction, bias);
  const chartLine = chartPattern ? `${chartPattern}` : "koi saaf chart pattern nahi";
  const candleLine = candlestickPattern
    ? `${candlestickPattern} (${candlestickConfidence}%)`
    : "abhi candlestick confirmation nahi";
  const patternLine = `${chartLine} + ${candleLine}`;

  // One-line Roman Urdu pattern explanation (Rule 3).
  const patternReason =
    `${chartPattern ? `Chart pattern: ${chartPattern}.` : "Chart pattern: trend-based setup."} ` +
    `${candlestickPattern ? `${candlestickPattern} candle ne ${candlestickConfidence}% confidence ke saath confirm kiya.` : "Candlestick: neutral (abhi confirmation nahi)."}`;

  const whyRomanUrdu =
    `${symbol} abhi ${dirWord} bias mein hai — ${trend}. ` +
    `${money(resistance)} pe resistance aur ${money(support)} pe support hai. ` +
    `Pattern: ${patternLine}. Aggressive entry ${money(entry1)}, conservative ${money(entry2)}. ` +
    `Stop loss ${money(stopLoss)} (risk ~${riskPercent}%). ` +
    `Targets: ${money(tp1)} / ${money(tp2)} / ${money(tp3)}. ` +
    (reason ? `Scanner note: ${reason}. ` : "") +
    `⚠️ Ye guaranteed nahi — apni research khud karein.`;

  const whyEnglish =
    `${symbol} currently shows a ${dirWord.toLowerCase()} bias — ${trend}. ` +
    `Resistance at ${money(resistance)}, support at ${money(support)}. ` +
    `Pattern: ${patternLine}. Aggressive entry ${money(entry1)}, conservative ${money(entry2)}. ` +
    `Stop loss ${money(stopLoss)} (risk ~${riskPercent}%). ` +
    `Targets: ${money(tp1)} / ${money(tp2)} / ${money(tp3)}. ` +
    (reason ? `Scanner note: ${reason}. ` : "") +
    `⚠️ Not guaranteed — do your own research.`;

  const reversalWarnings = bearish
    ? [
        `Agar ${money(resistance)} toot jaye → short setup fail (invalidate).`,
        `RSI agar oversold (<30) ho jaye → bounce aa sakta hai.`,
        `${money(support)} pe strong buying / volume spike → reversal ka risk.`,
      ]
    : [
        `Agar ${money(support)} toot jaye → long setup fail (invalidate).`,
        `RSI agar overbought (>70) ho jaye → pullback aa sakta hai.`,
        `${money(resistance)} pe strong selling / volume spike → reversal ka risk.`,
      ];

  const teacherNotesRomanUrdu =
    `Ye ${dirWord.toLowerCase()} setup strong lag raha hai. Do entries use karo — ` +
    `aggressive (${money(entry1)}) ya conservative (${money(entry2)}). ` +
    `Stop loss ${money(stopLoss)} ke peeche zaroor rakho; bina SL trade galat baat hai. ` +
    `TP1 (${money(tp1)}) pe thora profit book karlo, baaki ko trail karke TP2/TP3 tak le jao. ` +
    `Risk sirf itna rakho jitna aap afford kar sako.`;

  const teacherNotesEnglish =
    `This looks like a strong ${dirWord.toLowerCase()} setup. Use one of the two entries — ` +
    `aggressive (${money(entry1)}) or conservative (${money(entry2)}). ` +
    `Always keep the stop loss at ${money(stopLoss)}; trading without a stop loss is wrong. ` +
    `Book partial profit at TP1 (${money(tp1)}), then trail the rest toward TP2/TP3. ` +
    `Only risk what you can afford to lose.`;

  return {
    symbol,
    market,
    score,
    direction,
    pattern,
    chartPattern,
    chartPatternNote,
    candlestickPattern,
    candlestickConfidence,
    candlestickType,
    patternReason,
    trend,
    entry1,
    entry2,
    stopLoss,
    riskPercent,
    tp1,
    tp2,
    tp3,
    rr1: rr(tp1),
    rr2: rr(tp2),
    rr3: rr(tp3),
    support,
    resistance,
    prevHigh: resistance,
    prevLow: support,
    whyRomanUrdu,
    whyEnglish,
    reversalWarnings,
    teacherNotesRomanUrdu,
    teacherNotesEnglish,
  };
}

