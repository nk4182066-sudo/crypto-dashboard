/**
 * Signal gate — strict "100% clear setups only" filter.
 *
 * A candidate signal is emitted ONLY when all 8 checks pass. If any single
 * check fails, the signal is dropped and the UI says "No clear setup. Wait
 * karein." Strict quality > quantity.
 *
 * Checks:
 *  1. PATTERN CLEAR       — classical chart pattern, confidence >= 85%
 *  2. CANDLESTICK CLEAR   — bullish/bearish candle, strength >= 80%
 *  3. TREND CLEAR         — Uptrend/Downtrend (not Sideways), confidence >= 75%
 *  4. SCORE 90+           — overall confluence score >= 90
 *  5. RSI SAHI            — bullish 40-65, bearish 35-60 (no OB/OS extremes)
 *  6. VOLUME STRONG       — current volume >= 1.2x recent average
 *  7. SUPPORT/RESISTANCE  — clear level AND price within 1.5% of it
 *  8. R:R >= 1:2          — TP1 reward is at least 2x the risk
 *
 * TP/SL math (spec):
 *  - SL is a fixed 3% of entry (max risk distance → ≈30% margin loss @10x).
 *  - TP1 = 10% entry move, TP2 = 20%, TP3 = 30%  (≈100/200/300% profit @10x).
 *  - Min R:R = 1:3.
 *
 * Educational only. Not financial advice.
 */

import type { Candle, MarketAnalysis } from "./types";

/** Thresholds for the 8 checks (single source of truth). */
export const GATE = {
  patternMinConfidence: 85,
  candlestickMinStrength: 80,
  trendMinConfidence: 75,
  scoreMin: 90,
  rsiBullish: { min: 40, max: 65 },
  rsiBearish: { min: 35, max: 60 },
  volumeMultiple: 1.2,
  /** Price must be within this fraction of the S/R level to be "near". */
  srProximity: 0.015,
  minRewardRisk: 3,
  /** Stop loss is a fixed 3% of entry (≈30% margin loss at 10x). */
  maxStopLossPercent: 0.03,
  /** Fixed target price-move multiples of entry (≈100/200/300% profit @10x). */
  tpPercent: [0.1, 0.2, 0.3],
} as const;

/** Result of the gate for one candidate. */
export interface GateResult {
  pass: boolean;
  /** Human-readable reason for each check (for debugging / transparency). */
  checks: Record<string, string>;
  /** Computed plan (entry/SL/TP) when the gate passes. */
  plan?: TradePlan;
}

export interface TradePlan {
  entry: number;
  stopLoss: number;
  takeProfits: { label: string; price: number; rewardRisk: number; pricePercent: number; profitPercent: number }[];
  rewardRisk: number;
  /** SL price-move % (fixed 3). */
  slPercent: number;
  /** Margin loss % (price% × leverage; 0 when leverage unknown). */
  slLossPercent: number;
  /** Reward:risk summary string, e.g. "1:3.33". */
  rr: string;
  /** Leverage used for margin percentages (0 = not provided). */
  leverage: number;
}


/** Most recent strong classical pattern aligned with `dir`, or null. */
function alignedPattern(analysis: MarketAnalysis, dir: Direction) {
  const list = analysis.chartPatterns?.classical ?? [];
  const hits = list.filter(
    (p) => p.direction === dir && p.confidence >= GATE.patternMinConfidence
  );
  if (hits.length === 0) return null;
  return hits.sort((a, b) => b.confidence - a.confidence)[0];
}

/** Average volume over the last `window` candles (excluding the latest). */
function averageVolume(candles: Candle[], window = 20): number {
  if (candles.length < 3) return 0;
  const slice = candles.slice(-(window + 1), -1);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, c) => sum + (c.volume ?? 0), 0) / slice.length;
}

/** Rounds a price to sensible decimals for its magnitude. */
function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 1000) return Math.round(value * 100) / 100;
  if (value >= 1) return Math.round(value * 1000) / 1000;
  return Math.round(value * 100000) / 100000;
}

/**
 * Builds the SL/TP plan from the spec (leverage-aware, direction-correct):
 *  - SL = fixed 3% of entry  (≈30% margin loss @10x)
 *  - TP1/2/3 = 10% / 20% / 30% of entry  (≈100/200/300% profit @10x)
 *  - R:R per target = target% / sl% (min 1:3.33)
 *
 * `structuralStop` is retained for call-site compatibility but the fixed
 * spec governs the distances so loss/profit stay in the 20-30% / 100%+ band.
 */
function buildPlan(entry: number, dir: Direction, _structuralStop: number | null, leverage = 0): TradePlan {
  const slPricePercent = GATE.maxStopLossPercent * 100; // 3
  const stopLoss = dir === "bullish"
    ? roundPrice(entry * (1 - GATE.maxStopLossPercent))
    : roundPrice(entry * (1 + GATE.maxStopLossPercent));
  const takeProfits = GATE.tpPercent.map((pct, index) => {
    const price = dir === "bullish"
      ? roundPrice(entry * (1 + pct))
      : roundPrice(entry * (1 - pct));
    return {
      label: `TP${index + 1}`,
      price,
      rewardRisk: Math.round((pct / GATE.maxStopLossPercent) * 100) / 100,
      pricePercent: Math.round(pct * 100),
      profitPercent: Math.round(pct * 100 * leverage),
    };
  });
  const firstRR = takeProfits[0]?.rewardRisk ?? 0;
  return {
    entry: roundPrice(entry),
    stopLoss,
    takeProfits,
    rewardRisk: firstRR,
    slPercent: slPricePercent,
    slLossPercent: Math.round(slPricePercent * leverage),
    rr: `1:${firstRR.toFixed(2)}`,
    leverage,
  };
}

export type Direction = "bullish" | "bearish";

/** A candidate the gate evaluates before a signal is ever shown. */
export interface SignalCandidate {
  analysis: MarketAnalysis;
  candles: Candle[];
  /** Candlestick confirmation from detectCandlestickPattern(candles), or null. */
  candlestick: { name: string; confidence: number; type: "bullish" | "bearish" | "neutral" } | null;
  /** Overall confluence score (analysis.confidence). */
  score: number;
  /** Trader's leverage (drives margin loss/profit %). Optional. */
  leverage?: number;
}

/** Maps an ADX value to a 0-100 trend-confidence score (higher = cleaner trend). */
function adxConfidence(adx: number | null): number {
  if (adx === null) return 0;
  if (adx >= 40) return 90;
  if (adx >= 30) return 80;
  if (adx >= 25) return 75;
  if (adx >= 20) return 60;
  return 40;
}

/** Direction from the rule-based setup: buy -> bullish, sell -> bearish. */
function setupDirection(analysis: MarketAnalysis): Direction | null {
  return analysis.setup.direction === "buy" ? "bullish" : analysis.setup.direction === "sell" ? "bearish" : null;
}

/**
 * The strict gate. Returns pass=false (with a per-check reason) the moment any
 * one of the 8 checks fails, so a partial setup is never emitted as a signal.
 * On success it also returns the spec-compliant SL/TP plan.
 */
export function evaluateSignal(candidate: SignalCandidate): GateResult {
  const { analysis, candles, candlestick, score } = candidate;
  const checks: Record<string, string> = {};

  const dir = setupDirection(analysis);
  if (!dir) {
    return { pass: false, checks: { direction: "No directional setup (wait)." } };
  }

  const price = analysis.price;
  const wantedBias = dir === "bullish" ? "Bullish" : "Bearish";

  // 1 — PATTERN CLEAR: aligned classical pattern, confidence >= 85.
  const pattern = alignedPattern(analysis, dir);
  checks.pattern = pattern
    ? `OK ${pattern.name} @ ${pattern.confidence}%`
    : "No clear chart pattern (>=85%) aligned with direction.";
  if (!pattern) return { pass: false, checks };

  // 2 — CANDLESTICK CLEAR: confirmation aligned with direction, confidence >= 80.
  const candleOk =
    candlestick !== null && candlestick.type === dir && candlestick.confidence >= GATE.candlestickMinStrength;
  checks.candlestick = candleOk
    ? `OK ${candlestick?.name} @ ${candlestick?.confidence}%`
    : "No clear candlestick confirmation (>=80%) aligned with direction.";
  if (!candleOk) return { pass: false, checks };

  // 3 — TREND CLEAR: structure trend matches direction (not sideways) AND ADX-backed.
  let trendConf = adxConfidence(analysis.indicators.adx?.adx ?? null);
  const structureTrend = analysis.structure.trend;
  if (structureTrend === "Sideways") trendConf = Math.min(trendConf, 40);
  else if (structureTrend !== wantedBias) trendConf = Math.min(trendConf, 60);
  const trendOk = structureTrend !== "Sideways" && trendConf >= GATE.trendMinConfidence;
  checks.trend = trendOk
    ? `OK ${structureTrend} trend, confidence ${trendConf}%`
    : `Trend not clear (${structureTrend}, confidence ${trendConf}%).`;
  if (!trendOk) return { pass: false, checks };

  // 4 — SCORE 90+.
  const scoreOk = score >= GATE.scoreMin;
  checks.score = scoreOk ? `OK score ${score}` : `Score ${score} below ${GATE.scoreMin}.`;
  if (!scoreOk) return { pass: false, checks };

  // 5 — RSI SAHI: bullish 40-65, bearish 35-60 (no OB/OS extremes).
  const rsi = analysis.indicators.rsi14;
  const range = dir === "bullish" ? GATE.rsiBullish : GATE.rsiBearish;
  const rsiOk = rsi !== null && rsi >= range.min && rsi <= range.max;
  checks.rsi = rsiOk
    ? `OK RSI ${rsi}`
    : `RSI ${rsi ?? "n/a"} outside ${range.min}-${range.max} for ${dir}.`;
  if (!rsiOk) return { pass: false, checks };

  // 6 — VOLUME STRONG: latest volume >= 1.2x recent average.
  const latestVolume = candles.length > 0 ? candles[candles.length - 1]?.volume ?? 0 : 0;
  const avg = averageVolume(candles);
  const volumeOk = avg > 0 && latestVolume >= avg * GATE.volumeMultiple;
  checks.volume = volumeOk
    ? `OK ${(latestVolume / avg).toFixed(2)}x average`
    : `Volume ${(avg > 0 ? (latestVolume / avg).toFixed(2) : "n/a")}x below ${GATE.volumeMultiple}x.`;
  if (!volumeOk) return { pass: false, checks };

  // 7 — SUPPORT/RESISTANCE: clear level AND price within srProximity of it.
  const level = dir === "bullish" ? analysis.structure.lastSwingLow?.price : analysis.structure.lastSwingHigh?.price;
  const levelOk =
    typeof level === "number" &&
    Number.isFinite(level) &&
    level > 0 &&
    Math.abs(price - level) / price <= GATE.srProximity;
  checks.supportResistance = levelOk
    ? `OK near ${dir === "bullish" ? "support" : "resistance"} ${level}`
    : `Price not near a clear ${dir === "bullish" ? "support" : "resistance"} level.`;
  if (!levelOk) return { pass: false, checks };

  // 8 — R:R >= 1:3 (structurally guaranteed by buildPlan; asserted for safety).
  const structuralStop =
    dir === "bullish" ? analysis.structure.lastSwingLow?.price ?? null : analysis.structure.lastSwingHigh?.price ?? null;
  const plan = buildPlan(price, dir, typeof structuralStop === "number" ? structuralStop : null, candidate.leverage ?? 0);
  const rrOk = plan.rewardRisk >= GATE.minRewardRisk;
  checks.rewardRisk = rrOk ? `OK R:R ${plan.rr}` : `R:R ${plan.rr} below 1:${GATE.minRewardRisk}.`;
  if (!rrOk) return { pass: false, checks };

  return { pass: true, checks, plan };
}

