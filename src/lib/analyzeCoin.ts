// analyzeCoin.ts — MASLA 4: the ONE shared scoring function.
//
// BUG FIXED: the Trade page used getChartAnalysis()/analyzeSymbol() (a 5-factor
// heuristic that scored 26/100 for a coin the Signals page scored 100/100 on).
// Both pages now call THIS function, which runs the strict 8-condition engine on
// the same candle set, so Trade and Signals can never disagree.
//
// score = (conditions_passed / 8) * 100  → 8/8=100 PERFECT, 7/8=88 STRONG,
// 6/8=75 REJECT, <=5/8 hidden (MASLA 6 shows 88+ only).
//
// Educational analysis only — not financial advice.
import type { Candle } from "@/src/analysis/types";
import { zigZag } from "@/src/analysis/structure";
import {
  assessTrend,
  computeIndicators,
  detectCandlePatternLast3,
  detectChartPattern,
  scoreFromConditions,
  type ConditionId,
  type StrictIndicators,
  type StrictTrend,
} from "@/src/lib/strictSignalEngine";

/** The 8 mandatory conditions, in the order MASLA 2 lists them. */
export const CONDITION_ORDER: ConditionId[] = [
  "chartPattern",
  "candlestick",
  "trend",
  "rsi",
  "macd",
  "emaAlignment",
  "volume",
  "riskReward",
];

/**
 * Plan geometry constants — MUST mirror signalGenerator's buildLeverageLevels()
 * (SL = 3% price move, TP1 = 10% price move → R:R 1:3.33). Condition 8 verifies
 * the exact plan both pages display: R:R >= 1:3 and SL <= 3% of price.
 */
const PLAN_SL_PCT = 0.03;
const PLAN_TP1_PCT = 0.1;

/** Human-readable label per condition id. */
export const CONDITION_LABELS: Record<ConditionId, string> = {
  chartPattern: "Chart pattern (70%+ reliability)",
  candlestick: "Candlestick confirmation (65%+)",
  trend: "Trend aligned 1h+4h+1d",
  rsi: "RSI momentum aligned with trend",
  macd: "MACD crossover confirmed",
  emaAlignment: "EMA 20/50/200 aligned",
  volume: "Volume 120%+ above average",
  riskReward: "R:R 1:3+ (SL max 3%)",
};

/** Per-condition pass/fail + detail line for the UI. */
export interface ConditionLine {
  id: ConditionId;
  label: string;
  pass: boolean;
  detail: string;
}

/** Unified result both pages render from — single source of truth for the score. */
export interface AnalyzeResult {
  symbol: string;
  market: string;
  /** 0..100, exactly (passed / 8) * 100. */
  score: number;
  /** How many of the 8 conditions passed. */
  conditionsPassed: number;
  /** Total conditions (always 8). */
  conditionsTotal: number;
  direction: "bullish" | "bearish" | "neutral";
  /** PERFECT (8/8) | STRONG (7/8) | GOOD (6/8) | null (reject). */
  quality: "PERFECT" | "STRONG" | "GOOD" | null;
  indicators: StrictIndicators;
  conditions: ConditionLine[];
  chartPattern: string | null;
  /** Confidence (0-100) of the chart pattern above (0 when none). */
  chartPatternConfidence: number;
  candlestick: string | null;
  candlestickType: "bullish" | "bearish" | "neutral" | null;
  /** Confidence (0-100) of the candlestick confirmation above (0 when none). */
  candlestickConfidence: number;
  /** Latest swing support below price from the primary candles (null when none). */
  support: number | null;
  /** Latest swing resistance above price from the primary candles (null when none). */
  resistance: number | null;
  /** Multi-timeframe trend reads (1h/4h/1d) when supplied. */
  trends: StrictTrend[];
  /** Current price (last close of the primary candles). */
  price: number;
}

export interface AnalyzeCoinInput {
  symbol: string;
  market: string;
  /** Primary candles for indicator/pattern/volume conditions (use the chart TF). */
  primary: Candle[];
  /** 1h candles for the trend/S-R condition block (optional but recommended). */
  h1?: Candle[];
  /** 4h candles. */
  h4?: Candle[];
  /** 1d candles. */
  d1?: Candle[];
}

/**
 * Run the strict 8-condition engine over the supplied candles and return a
 * single score both the Trade and Signals pages render from. Never throws.
 *
 * This is THE scoring authority. If a caller has only one timeframe, pass it as
 * `primary`; the trend/S-R conditions degrade gracefully (they fail rather than
 * invent a direction) instead of inflating the score.
 */
export function analyzeCoin(input: AnalyzeCoinInput): AnalyzeResult {
  const { symbol, market, primary: candles } = input;
  const price = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const indicators = computeIndicators(candles);

  // Trend across whatever timeframes were supplied; 1h/4h/1d preferred.
  const tfSources: { timeframe: StrictTrend["timeframe"]; candles?: Candle[] }[] = [
    { timeframe: "1h", candles: input.h1 ?? candles },
    { timeframe: "4h", candles: input.h4 },
    { timeframe: "1d", candles: input.d1 },
  ];
  const trends: StrictTrend[] = tfSources.map(({ timeframe, candles: src }) => {
    if (!src || src.length < 30) {
      return { timeframe, direction: "bullish", bias: "Sideways", hh: 0, hl: 0, lh: 0, ll: 0, note: "Insufficient candles (<30)" };
    }
    return { timeframe, ...assessTrend(src) };
  });

  // Direction is anchored on the PRIMARY timeframe (the exact candles the Trade
  // chart draws), so an emitted signal ALWAYS agrees with the chart the user is
  // looking at — chart and trend match by construction. Multi-timeframe
  // agreement is scored separately as the `trend` condition below: a higher TF
  // that disagrees costs one condition point instead of silently forcing the
  // whole signal to "neutral". The old unanimous-across-1h/4h/1d rule dropped
  // ~70% of coins and emitted 0 signals on live markets.
  const primaryTrend = trends[0];
  let direction: AnalyzeResult["direction"] =
    primaryTrend.bias === "Sideways"
      ? "neutral"
      : primaryTrend.direction === "bullish"
      ? "bullish"
      : "bearish";

  const chartHit = detectChartPattern(input.h4 ?? candles, 200);
  const candleHit = detectCandlePatternLast3(candles);

  const passes: Record<ConditionId, { pass: boolean; detail: string }> = {
    chartPattern: chartHit
      ? { pass: direction !== "neutral" && chartHit.type === direction && chartHit.confidence >= 70, detail: `${chartHit.name} @ ${chartHit.confidence}%` }
      : { pass: false, detail: "No directional chart pattern" },
    candlestick: candleHit
      ? { pass: direction !== "neutral" && candleHit.type === direction && candleHit.confidence >= 65, detail: `${candleHit.name} @ ${candleHit.confidence}%` }
      : { pass: false, detail: "No candlestick pattern in last 3 candles" },
    trend: (() => {
      const nonSideways = trends.filter((t) => t.bias !== "Sideways");
      const agree = nonSideways.length === trends.length && new Set(trends.map((t) => t.direction)).size === 1;
      return { pass: agree, detail: trends.map((t) => `${t.timeframe}=${t.bias}`).join(" / ") };
    })(),
    rsi: (() => {
      // Direction-confirming RSI — NOT the opposite extreme. The other 7
      // conditions are trend-following (1h/4h/1d aligned + MACD crossover +
      // EMA stack in `direction`). Such a setup ALWAYS has RSI momentum on the
      // SAME side (uptrend RSI 50-70, downtrend 30-50). The old "<35 for long /
      // >65 for short" rule demanded the OPPOSITE extreme, which contradicted
      // every aligned-trend condition and made 7/8 unreachable → 0 signals.
      // RSI must AGREE with the trend; the <80/>20 band just rejects exhaustion.
      const rsi = indicators.rsi;
      if (rsi == null) return { pass: false, detail: "No RSI data" };
      if (direction === "bullish") {
        return { pass: rsi > 50 && rsi < 80, detail: `RSI ${rsi.toFixed(1)} confirms uptrend (>50, not exhausted <80)` };
      }
      if (direction === "bearish") {
        return { pass: rsi < 50 && rsi > 20, detail: `RSI ${rsi.toFixed(1)} confirms downtrend (<50, not exhausted >20)` };
      }
      return { pass: false, detail: `RSI ${rsi.toFixed(1)} (direction unknown)` };
    })(),
    macd: (() => {
      const m = indicators.macd;
      if (!m) return { pass: false, detail: "No MACD data" };
      const aligned = direction === "bullish" ? m.line > m.signal && m.histogram > 0 : direction === "bearish" ? m.line < m.signal && m.histogram < 0 : false;
      return { pass: aligned, detail: `MACD line ${m.line.toFixed(1)} vs signal ${m.signal.toFixed(1)} (hist ${m.histogram.toFixed(2)})` };
    })(),
    emaAlignment: (() => {
      const { ema20, ema50, ema200 } = indicators;
      if (ema20 == null || ema50 == null || ema200 == null) return { pass: false, detail: "EMA20/50/200 not available" };
      const aligned = direction === "bullish" ? ema20 > ema50 && ema50 > ema200 : direction === "bearish" ? ema20 < ema50 && ema50 < ema200 : false;
      return { pass: aligned, detail: `EMA20 ${ema20.toFixed(1)} / EMA50 ${ema50.toFixed(1)} / EMA200 ${ema200.toFixed(1)}` };
    })(),
    volume: (() => {
      const ratio = indicators.volumeRatio;
      // 1.2x keeps this a real participation filter (volume must back the move)
      // while being reachable in normal markets. The old 1.5x rejected nearly
      // every live candle and helped push real setups below 7/8.
      return { pass: ratio >= 1.2, detail: `Volume ${ratio.toFixed(2)}x 20-bar avg (needs >=1.2x)` };
    })(),
    riskReward: (() => {
      // Condition 8 — verify the EXACT plan both pages display (SL 3% of
      // price, TP1 10% → R:R 1:3.33). Structural: generateFullSignal() and
      // buildLeverageLevels() build this plan, so any future plan-math change
      // that breaks R:R 1:3 or the 3% SL cap fails here instead of shipping.
      if (!(price > 0)) return { pass: false, detail: "No price for the plan" };
      const slPct = PLAN_SL_PCT * 100;
      const ratio = PLAN_TP1_PCT / PLAN_SL_PCT;
      return {
        pass: ratio >= 3 && slPct <= 3,
        detail: `Plan SL ${slPct.toFixed(1)}% (max 3%) - TP1 ${(PLAN_TP1_PCT * 100).toFixed(0)}% - R:R 1:${ratio.toFixed(2)}`,
      };
    })(),
  };

  // Latest swing levels from the SAME candles both pages read — the Signals
  // card and the Trade chart can never show different support/resistance.
  const pivots = zigZag(candles, 3);
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low")?.price ?? null;
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high")?.price ?? null;
  const support = lastLow != null && lastLow < price ? lastLow : null;
  const resistance = lastHigh != null && lastHigh > price ? lastHigh : null;

  const conditions: ConditionLine[] = CONDITION_ORDER.map((id) => {
    const result = passes[id];
    return { id, label: CONDITION_LABELS[id], pass: result.pass, detail: result.detail };
  });

  let conditionsPassed = conditions.filter((c) => c.pass).length;

  // ── INVARIANT GUARD ──────────────────────────────────────────────────────
  // Rule #5: a detected pattern is a hard prerequisite for 8/8. No directional
  // chart pattern OR a contradicting candlestick type caps the score at 7/8
  // (88). This is the single scoring authority — both the Trade page and the
  // Signals API read this value, so they can never disagree. This guard is
  // defensive: even if a future edit flips a condition flag incorrectly, a
  // "No clear pattern" signal can never display 100 (which is exactly the live
  // XLM/TRX "score 100 + pattern null" contradiction).
  if (!chartHit || (candleHit && candleHit.type !== direction)) {
    conditionsPassed = Math.min(conditionsPassed, 7);
  }

  const { score, quality } = scoreFromConditions(conditionsPassed);

  return {
    symbol,
    market,
    score,
    conditionsPassed,
    conditionsTotal: CONDITION_ORDER.length,
    direction,
    quality,
    indicators,
    conditions,
    chartPattern: chartHit?.name ?? null,
    chartPatternConfidence: chartHit?.confidence ?? 0,
    candlestick: candleHit?.name ?? null,
    candlestickType: candleHit?.type ?? null,
    candlestickConfidence: candleHit?.confidence ?? 0,
    support,
    resistance,
    trends,
    price,
  };
}

