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

/** The 8 mandatory conditions, in the order MASLA 8 lists them. */
export const CONDITION_ORDER: ConditionId[] = [
  "chartPattern",
  "candlestick",
  "trend",
  "rsi",
  "macd",
  "emaAlignment",
  "volume",
  "supportResistance",
];

/** Human-readable label per condition id. */
export const CONDITION_LABELS: Record<ConditionId, string> = {
  chartPattern: "Chart pattern (70%+ reliability)",
  candlestick: "Candlestick confirmation (65%+)",
  trend: "Trend aligned 1h+4h+1d",
  rsi: "RSI extreme (<35 / >65)",
  macd: "MACD crossover confirmed",
  emaAlignment: "EMA 20/50/200 aligned",
  volume: "Volume 150%+ above average",
  supportResistance: "Price at S/R zone (1.5x ATR)",
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
  candlestick: string | null;
  /** Multi-timeframe trend reads (1h/4h/1d) when supplied. */
  trends: StrictTrend[];
  /** Current price (last close of the primary candles). */
  price: number;
}

/** R:R geometry so both pages show identical SL/TP (MASLA 8 #8: 1:3, SL 1.5x ATR). */
export function rewardRisk(
  price: number,
  direction: AnalyzeResult["direction"],
  atr: number | null,
): { stopLoss: number; takeProfit: number; ratio: number } {
  if (direction === "neutral" || !(atr && atr > 0) || !(price > 0)) {
    return { stopLoss: 0, takeProfit: 0, ratio: 0 };
  }
  const stopDistance = atr * 1.5;
  const targetDistance = stopDistance * 3;
  const stopLoss = direction === "bullish" ? price - stopDistance : price + stopDistance;
  const takeProfit = direction === "bullish" ? price + targetDistance : price - targetDistance;
  return { stopLoss, takeProfit, ratio: 3 };
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

  // Direction: unanimous across non-sideways trends; else neutral.
  const usableTrends = trends.filter((t) => t.bias !== "Sideways");
  let direction: AnalyzeResult["direction"] = "neutral";
  if (usableTrends.length > 0) {
    const set = new Set(usableTrends.map((t) => t.direction));
    direction = set.size === 1 ? (usableTrends[0].direction === "bullish" ? "bullish" : "bearish") : "neutral";
  }

  const chartHit = detectChartPattern(input.h4 ?? candles, 200);
  const candleHit = detectCandlePatternLast3(candles);

  const passes: Record<Exclude<ConditionId, "supportResistance">, { pass: boolean; detail: string }> = {
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
      const rsi = indicators.rsi;
      if (rsi == null) return { pass: false, detail: "No RSI data" };
      if (direction === "bullish") return { pass: rsi < 35, detail: `RSI ${rsi.toFixed(1)} (needs <35 for long)` };
      if (direction === "bearish") return { pass: rsi > 65, detail: `RSI ${rsi.toFixed(1)} (needs >65 for short)` };
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
      return { pass: ratio > 1.5, detail: `Volume ${ratio.toFixed(2)}x 20-bar avg (needs >1.5x)` };
    })(),
  };

  // Condition 8 — S/R proximity (mirrors the strict engine's own geometry).
  const srPass = conditionSupportResistanceFor(candles, indicators, direction);

  const conditions: ConditionLine[] = CONDITION_ORDER.map((id) => {
    const result = id === "supportResistance" ? srPass : passes[id];
    return { id, label: CONDITION_LABELS[id], pass: result.pass, detail: result.detail };
  });

  const conditionsPassed = conditions.filter((c) => c.pass).length;
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
    candlestick: candleHit?.name ?? null,
    trends,
    price,
  };
}

/** Local copy of the engine's S/R proximity rule (mirrors strictSignalEngine). */
function conditionSupportResistanceFor(candles: Candle[], indicators: StrictIndicators, direction: AnalyzeResult["direction"]): { pass: boolean; detail: string } {
  if (direction === "neutral") return { pass: false, detail: "Direction unknown" };
  if (candles.length < 20) return { pass: false, detail: "Not enough candles for S/R levels" };
  const pivots = zigZag(candles, 3);
  const lows = pivots.filter((p) => p.kind === "low").map((p) => p.price);
  const highs = pivots.filter((p) => p.kind === "high").map((p) => p.price);
  if (lows.length === 0 || highs.length === 0) return { pass: false, detail: "No swing levels found" };
  const atr = indicators.atr14 ?? 0;
  const proximity = 1.5 * atr;
  const close = candles[candles.length - 1].close;
  if (direction === "bullish") {
    const support = Math.min(...lows);
    if (support <= 0) return { pass: false, detail: "No valid support" };
    const distance = close - support;
    return { pass: distance >= 0 && distance <= proximity, detail: `${distance.toFixed(0)} above support ${support.toFixed(0)} (within 1.5x ATR)` };
  }
  const resistance = Math.max(...highs);
  if (resistance <= 0) return { pass: false, detail: "No valid resistance" };
  const distance = resistance - close;
  return { pass: distance >= 0 && distance <= proximity, detail: `${distance.toFixed(0)} below resistance ${resistance.toFixed(0)} (within 1.5x ATR)` };
}

