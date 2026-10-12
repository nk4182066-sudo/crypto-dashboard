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
 *  - SL is capped at 2.5% of entry (max risk distance).
 *  - TP1 = 2x SL distance, TP2 = 4x, TP3 = 6x  (min R:R = 1:2).
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
  minRewardRisk: 2,
  /** Stop loss is capped at this fraction of entry. */
  maxStopLossPercent: 0.025,
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
  takeProfits: { label: string; price: number; rewardRisk: number }[];
  rewardRisk: number;
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
 * Builds the SL/TP plan from the spec:
 *  - risk distance = min(2.5% of entry, structural level distance)
 *  - TP1/2/3 at 2x / 4x / 6x the risk distance  (min R:R = 1:2)
 */
function buildPlan(entry: number, dir: Direction, structuralStop: number | null): TradePlan {
  const maxRisk = entry * GATE.maxStopLossPercent;
  let risk = maxRisk;
  if (structuralStop !== null && Number.isFinite(structuralStop)) {
    const structuralRisk = Math.abs(entry - structuralStop);
    // Prefer the tighter of the structural stop and the 2.5% cap (never wider).
    if (structuralRisk > 0) risk = Math.min(maxRisk, structuralRisk);
  }
  const stopLoss = dir === "bullish" ? roundPrice(entry - risk) : roundPrice(entry + risk);
  const tp = (r: number) =>
    dir === "bullish" ? roundPrice(entry + risk * r) : roundPrice(entry - risk * r);
  const takeProfits = [
    { label: "TP1", price: tp(2), rewardRisk: 2 },
    { label: "TP2", price: tp(4), rewardRisk: 4 },
    { label: "TP3", price: tp(6), rewardRisk: 6 },
  ];
  return { entry: roundPrice(entry), stopLoss, takeProfits, rewardRisk: 2 };
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

  // 8 — R:R >= 1:2 (structurally guaranteed by buildPlan; asserted for safety).
  const structuralStop =
    dir === "bullish" ? analysis.structure.lastSwingLow?.price ?? null : analysis.structure.lastSwingHigh?.price ?? null;
  const plan = buildPlan(price, dir, typeof structuralStop === "number" ? structuralStop : null);
  const rrOk = plan.rewardRisk >= GATE.minRewardRisk;
  checks.rewardRisk = rrOk ? `OK R:R ${plan.rewardRisk.toFixed(2)}` : `R:R ${plan.rewardRisk.toFixed(2)} below ${GATE.minRewardRisk}.`;
  if (!rrOk) return { pass: false, checks };

  return { pass: true, checks, plan };
}

