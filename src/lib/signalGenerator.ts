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
  /** Trader's leverage (drives margin loss/profit %). Defaults to 10. */
  leverage?: number;
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
  /** Leverage used for margin loss/profit percentages. */
  leverage: number;
  /** SL price-move % (fixed 3). */
  slPercent: number;
  /** Margin loss % at leverage (e.g. 30 at 10x). */
  slLossPercent: number;
  /** TP price-move % (10 / 20 / 30). */
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  /** Margin profit % at leverage (e.g. 100 / 200 / 300 at 10x). */
  tp1ProfitPercent: number;
  tp2ProfitPercent: number;
  tp3ProfitPercent: number;
  /** Reward:risk summary string, e.g. "1:3.33". */
  rr: string;
  support: number;
  resistance: number;
  prevHigh: number;
  prevLow: number;
  whyRomanUrdu: string;
  whyEnglish: string;
  reversalWarnings: string[];
  /** KAAM 6 — upside scenario (what a winning continuation looks like). */
  bullCase: string;
  /** KAAM 6 — downside scenario (what failure looks like). */
  bearCase: string;
  /** KAAM 6 — the exact conditions that invalidate the setup. */
  invalidation: string[];
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

// ── Leverage-aware SL/TP constants (single source of truth) ──────────────
// SL is a fixed 3% price move (≈30% margin loss at 10x) and the targets are
// fixed 10% / 20% / 30% price moves (≈100% / 200% / 300% margin profit at
// 10x). This guarantees R:R ≥ 1:3.33 on every signal.
const SL_PRICE_PCT = 0.03;
const TP1_PRICE_PCT = 0.1;
const TP2_PRICE_PCT = 0.2;
const TP3_PRICE_PCT = 0.3;

export interface LeverageLevels {
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  slPercent: number;
  slLossPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  tp1ProfitPercent: number;
  tp2ProfitPercent: number;
  tp3ProfitPercent: number;
  rr: string;
  leverage: number;
}

/**
 * Leverage-aware SL/TP plan shared by the signal generator and the trade
 * chart. SL = 3% price move; TP1/2/3 = 10/20/30% price moves. At L× leverage
 * the trade risks ≈(3×L)% of margin to make ≈(10×L)%+ on TP1 (R:R 1:3.33).
 * Direction flips which side of the entry each level sits on:
 *   bullish → SL below entry, targets above;  bearish → the reverse.
 */
export function buildLeverageLevels(price: number, direction: "bullish" | "bearish", leverage = 10): LeverageLevels {
  const lev = Number.isFinite(leverage) && leverage > 0 ? leverage : 10;
  const entry = roundPrice(price);
  const sign = direction === "bullish" ? 1 : -1;
  const stopLoss = roundPrice(entry * (1 - sign * SL_PRICE_PCT));
  const tp1 = roundPrice(entry * (1 + sign * TP1_PRICE_PCT));
  const tp2 = roundPrice(entry * (1 + sign * TP2_PRICE_PCT));
  const tp3 = roundPrice(entry * (1 + sign * TP3_PRICE_PCT));
  return {
    direction,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    slPercent: SL_PRICE_PCT * 100,
    slLossPercent: Math.round(SL_PRICE_PCT * 100 * lev),
    tp1Percent: TP1_PRICE_PCT * 100,
    tp2Percent: TP2_PRICE_PCT * 100,
    tp3Percent: TP3_PRICE_PCT * 100,
    tp1ProfitPercent: Math.round(TP1_PRICE_PCT * 100 * lev),
    tp2ProfitPercent: Math.round(TP2_PRICE_PCT * 100 * lev),
    tp3ProfitPercent: Math.round(TP3_PRICE_PCT * 100 * lev),
    rr: `1:${(TP1_PRICE_PCT / SL_PRICE_PCT).toFixed(2)}`,
    leverage: lev,
  };
}

/**
 * Builds the full educational signal. Leverage-aware SL/TP math:
 * - Entry 1 (aggressive): current price
 * - Entry 2 (conservative): near support (bullish) / resistance (bearish)
 * - SL: 3% price move from entry (≈30% margin loss at 10x)
 * - TP1/2/3: 10% / 20% / 30% price moves (≈100% / 200% / 300% profit at 10x)
 * - R:R per target = reward / risk (min 1:3.33)
 */
export function generateFullSignal(input: FullSignalInput): FullSignal {
  const { symbol, market, direction, pattern = null, score = 0, bias, reason } = input;
  const price = Number.isFinite(input.price) && input.price > 0 ? input.price : 0;
  if (price <= 0) throw new Error(`[signalGenerator] REJECT: price ${input.price} <= 0 for ${symbol}`);

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

  const lev = input.leverage && input.leverage > 0 ? input.leverage : 10;
  // Leverage-aware plan: SL 3% (≈30% loss @10x), TP1/2/3 10/20/30%
  // (≈100/200/300% profit @10x), R:R 1:3.33. Direction-aware.
  const plan = buildLeverageLevels(price, bearish ? "bearish" : "bullish", lev);

  // Entry 1 (aggressive) = current price; Entry 2 (conservative) = the S/R
  // level (support for longs, resistance for shorts).
  const entry1 = plan.entry;
  const entry2 = bearish ? roundPrice(resistance) : roundPrice(support);
  const stopLoss = plan.stopLoss;
  const tp1 = plan.tp1;
  const tp2 = plan.tp2;
  const tp3 = plan.tp3;

  const riskAbs = Math.abs(entry1 - stopLoss) || 1;
  const rr = (tp: number) => Math.round((Math.abs(tp - entry1) / riskAbs) * 10) / 10;
  const riskPercent = plan.slPercent;

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

  // KAAM 6 — explicit bull / bear scenario + invalidation triggers.
  const bullCase = bearish
    ? `Bear case (short): agar ${money(resistance)} phir reject ho aur volume badhe to ${money(tp1)} → ${money(tp3)} tak move ho sakta hai.`
    : `Bull case (long): agar breakout volume ke saath ${money(tp1)} cross kare to ${money(tp3)} tak extension ho sakti hai.`;

  const bearCase = bearish
    ? `Bear case fails: agar price ${money(resistance)} ke upar close kare → short galat, cover karein.`
    : `Bear case: agar ${money(support)} support toot jaye to ${money(support * 0.97)} tak gir sakta hai.`;

  const invalidation = bearish
    ? [
        `Signal invalid hoga jab: (1) 4h candle ${money(resistance)} ke UPAR close kare,`,
        `(2) RSI 30 se neeche gir jaye (strong bounce — cover karein),`,
        `(3) volume 50% se zyada drop ho jaye.`,
      ]
    : [
        `Signal invalid hoga jab: (1) 4h candle ${money(stopLoss)} ke NEECHE close kare,`,
        `(2) RSI 50 se upar chala jaye bina price ${money(tp1)} ki taraf move ke,`,
        `(3) volume 50% se zyada drop ho jaye.`,
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
    leverage: plan.leverage,
    slPercent: plan.slPercent,
    slLossPercent: plan.slLossPercent,
    tp1Percent: plan.tp1Percent,
    tp2Percent: plan.tp2Percent,
    tp3Percent: plan.tp3Percent,
    tp1ProfitPercent: plan.tp1ProfitPercent,
    tp2ProfitPercent: plan.tp2ProfitPercent,
    tp3ProfitPercent: plan.tp3ProfitPercent,
    rr: plan.rr,
    support,
    resistance,
    prevHigh: resistance,
    prevLow: support,
    whyRomanUrdu,
    whyEnglish,
    reversalWarnings,
    bullCase,
    bearCase,
    invalidation,
    teacherNotesRomanUrdu,
    teacherNotesEnglish,
  };
}

