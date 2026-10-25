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
// MASLA 5 — single shared price formatter/rounder (fixes SHIB $0.0000 + BTC cents).
import { roundPrice, formatPrice as money } from "@/src/lib/formatPrice";
// Dynamic SL/TP geometry (ATR + Support/Resistance) — replaces the old static
// 3% SL / 10-20-30% TP ladder that squished the chart on 1h/15m views.
import { buildTradeSetup, type TradeSetupOutput } from "@/src/lib/tradeSetup";
import { buildAtrPlan, type AtrPlan } from "@/src/lib/atrPlan";

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
  /** DYNAMIC plan inputs (see PlanContext) — primary candles / pre-computed
   *  ATR / explicit timeframe. Omitted → the plan degrades to the S/R
   *  structure proxy, never to static percentages. */
  candles?: Candle[] | null;
  atr?: number | null;
  timeframeMinutes?: number | null;
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

// roundPrice + money (formatPrice) are imported from @/src/lib/formatPrice above.


function trendOf(direction: SignalDirection, bias?: string | null): string {
  const b = (bias ?? "").toLowerCase();
  if (direction === "bearish") return "Downtrend (Lower Highs / Lower Lows)";
  if (direction === "bullish") return "Uptrend (Higher Highs / Higher Lows)";
  if (b.includes("bull")) return "Uptrend (Higher Highs / Higher Lows)";
  if (b.includes("bear")) return "Downtrend (Lower Highs / Lower Lows)";
  return "Sideways / Range";
}

/** Chart/plan context — the DYNAMIC inputs of the ATR plan. All optional: a
 *  cold caller (stored card without candles) degrades to the structure proxy
 *  inside buildAtrPlan() instead of falling back to static percentages. */
export interface PlanContext {
  /** Primary-timeframe candles (ATR + timeframe class). */
  candles?: Candle[] | null;
  /** Pre-computed ATR (analyzeCoin() exposes the one both pages share). */
  atr?: number | null;
  /** Explicit timeframe minutes (1m/5m/15m → tight ladder, 1h+ → default). */
  timeframeMinutes?: number | null;
  /** Swing support (bullish stop side) / resistance (bearish stop side). */
  support?: number | null;
  resistance?: number | null;
}

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
 * chart — DYNAMIC, ATR-based (see src/lib/atrPlan.ts):
 *   >=1h: SL 1x ATR, TP1 1.5x (~2-3h), TP2 2.5x (~4-5h), TP3 4x (~6-8h)
 *   <=15m: tight ladder (SL/TP1 0.5x, TP2 1x, TP3 1.5x) — "aur bhi tight"
 * Support/Resistance trim TP1 to the nearest wall and may place the stop just
 * beyond structure, but only while R:R(TP3) >= 1:3 and SL <= 3% of price hold.
 * Direction flips which side of the entry each level sits on:
 *   bullish → SL below entry, targets above;  bearish → the reverse.
 */
export function buildLeverageLevels(
  price: number,
  direction: "bullish" | "bearish",
  leverage = 10,
  context: PlanContext = {},
): LeverageLevels {
  const lev = Number.isFinite(leverage) && leverage > 0 ? leverage : 10;
  const plan: AtrPlan = buildAtrPlan({
    price,
    direction,
    candles: context.candles,
    atr: context.atr,
    timeframeMinutes: context.timeframeMinutes,
    support: context.support,
    resistance: context.resistance,
  });
  return {
    direction,
    entry: plan.entry,
    stopLoss: plan.stopLoss,
    tp1: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    slPercent: plan.slPct,
    slLossPercent: Math.round(plan.slPct * lev),
    tp1Percent: plan.tp1Pct,
    tp2Percent: plan.tp2Pct,
    tp3Percent: plan.tp3Pct,
    tp1ProfitPercent: Math.round(plan.tp1Pct * lev),
    tp2ProfitPercent: Math.round(plan.tp2Pct * lev),
    tp3ProfitPercent: Math.round(plan.tp3Pct * lev),
    rr: `1:${plan.rr1.toFixed(2)}`,
    leverage: lev,
  };
}

/**
 * Builds the full educational signal. Leverage-aware SL/TP math:
 * - Entry 1 (aggressive): current price
 * - Entry 2 (conservative): near support (bullish) / resistance (bearish)
 * - SL / TP1-3: DYNAMIC ATR ladder (>=1h: 1x/1.5x/2.5x/4x ATR; <=15m: tight),
 *   trimmed by Support/Resistance — never fixed 3% / 10/20/30% (atrPlan.ts)
 * - R:R per target = reward / risk of the SAME plan (TP3 R:R >= 1:3)
 */
export function generateFullSignal(input: FullSignalInput): FullSignal | null {
  const { symbol, market, direction, pattern = null, score = 0, bias, reason } = input;
  const price = Number.isFinite(input.price) && input.price > 0 ? input.price : 0;
  if (price <= 0) throw new Error(`[signalGenerator] REJECT: price ${input.price} <= 0 for ${symbol}`);

// CANDLESTICK NEUTRAL REJECTION - if type is "neutral", reject signal
if (input.candlestick?.type === "neutral") {
  console.warn(`[generateFullSignal] Rejecting signal for ${symbol}: candlestick pattern is neutral (no confirmation)`);
  return null;
}
  // Derive support / resistance so they are never empty (Rule 5).
  const support = input.support && input.support > 0 ? input.support : roundPrice(price * 0.97);
  const resistance = input.resistance && input.resistance > 0 ? input.resistance : roundPrice(price * 1.03);

  const bullish = direction === "bullish";
  const bearish = direction === "bearish";

  const lev = input.leverage && input.leverage > 0 ? input.leverage : 20;
  // Leverage-aware plan: DYNAMIC ATR geometry — the SAME ladder the Trade
  // chart draws (context carries candles/ATR/timeframe + S/R for trimming).
  const setup = buildTradeSetup({ price, direction: bullish ? "BUY" : "SELL", leverage: lev, collateralUsdt: 7 });

// Validate SL/TP are solid positive numbers (not 0, not null, not NaN)
if (setup.stopLoss == null || setup.stopLoss <= 0 || isNaN(setup.stopLoss)) {
  console.warn(`[generateFullSignal] Rejecting signal for ${symbol}: invalid stopLoss`);
  return null;
}
if (setup.tp1 == null || setup.tp1 <= 0 || isNaN(setup.tp1)) {
  console.warn(`[generateFullSignal] Rejecting signal for ${symbol}: invalid tp1`);
  return null;
}
if (setup.tp2 == null || setup.tp2 <= 0 || isNaN(setup.tp2)) {
  console.warn(`[generateFullSignal] Rejecting signal for ${symbol}: invalid tp2`);
  return null;
}
if (setup.tp3 == null || setup.tp3 <= 0 || isNaN(setup.tp3)) {
  console.warn(`[generateFullSignal] Rejecting signal for ${symbol}: invalid tp3`);
  return null;
}
  // Entry 1 (aggressive) = current price; Entry 2 (conservative) = the S/R
  // level (support for longs, resistance for shorts).
  const entry1 = setup.entry1;
  const entry2 = setup.entry2;
  const stopLoss = setup.stopLoss;
  const tp1 = setup.tp1;
  const tp2 = setup.tp2;
  const tp3 = setup.tp3;

  const riskAbs = Math.abs(entry1 - stopLoss) || 1;
  const rr = (tp: number) => Math.round((Math.abs(tp - entry1) / riskAbs) * 10) / 10;
  const riskPercent = setup.slPercent;

    // MASLA 3: MTF pattern filtering - reject contradictory patterns
  const trendDirection = direction === "bullish" ? "bullish" : direction === "bearish" ? "bearish" : "neutral";
  let filteredChartPattern = pattern;
  if (pattern && trendDirection !== "neutral") {
    const cp = pattern.toLowerCase();
    const bullishPatterns = ["double bottom", "bullish engulfing", "bullish harami", "hammer", "morning star", "tweezer bottom", "bull flag", "ascending triangle", "cup and handle"];
    const bearishPatterns = ["triple top", "evening star", "bearish engulfing", "shooting star", "bearish harami", "hanging man", "dark cloud cover", "bear flag", "descending triangle", "head & shoulders"];
    const isBullish = bullishPatterns.some((p) => cp.includes(p));
    const isBearish = bearishPatterns.some((p) => cp.includes(p));
    if (trendDirection === "bullish" && !isBullish) filteredChartPattern = null;
    else if (trendDirection === "bearish" && !isBearish) filteredChartPattern = null;
  }
  const chartPattern = filteredChartPattern ?? input.chartPattern ?? null;
  const chartPatternNote = input.chartPatternNote ?? null;
  const candle = input.candlestick ?? null;
  const candlestickPattern = candle?.name ?? null;
  const candlestickConfidence = candle?.confidence ?? 0;
  const candlestickType = candle?.type ?? null;

  const stopLossFinal = stopLoss;

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
    `Stop loss ${money(stopLossFinal)} (risk ~${riskPercent}%). ` +
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
    stopLoss: stopLossFinal,
    riskPercent,
    tp1,
    tp2,
    tp3,
    rr1: rr(tp1),
    rr2: rr(tp2),
    rr3: rr(tp3),
    leverage: lev,
    slPercent: setup.slPercent,
    slLossPercent: setup.slLossPercent,
    tp1Percent: setup.tp1Percent,
    tp2Percent: setup.tp2Percent,
    tp3Percent: setup.tp3Percent,
    tp1ProfitPercent: setup.tp1ProfitPercent,
    tp2ProfitPercent: setup.tp2ProfitPercent,
    tp3ProfitPercent: setup.tp3ProfitPercent,
    rr: setup.riskRewardRatio,
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

