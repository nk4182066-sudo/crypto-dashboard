// institutionalEngine.ts - FINAL Institutional Signal Engine
// Real indicators, MTF gating, pivot-based patterns, strict SL/TP, 4/4 experts gate.

import type { Candle } from "@/src/analysis/types";
import { formatPrice, roundPrice } from "@/src/lib/formatPrice";
import { getMarketData } from "@/src/lib/marketData";
import { zigZag } from "@/src/analysis/structure";
// technicalindicators exports indicator CLASSES (RSI, MACD, …) with a static
// .calculate() — there are no compute* named exports. Thin local adapters keep
// the call sites below readable.
import { RSI, MACD, ATR, ADX, BollingerBands, EMA } from "technicalindicators";

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type SignalDirection = "bullish" | "bearish" | "neutral";
export type PatternDirection = "bullish" | "bearish" | "neutral";

export interface PatternResult {
  pattern: string | null;
  type: PatternDirection;
  confidence: number;
  note: string;
}

export interface FullSignal {
  symbol: string;
  market: string;
  score: number;
  direction: SignalDirection;
  pattern: string | null;
  chartPattern: string | null;
  candlestickPattern: string | null;
  candlestickConfidence: number;
  candlestickType: PatternDirection;
  trend: string;
  entry1: number;
  entry2: number;
  support: number | null;
  resistance: number | null;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPercent: number;
  rr1: number;
  rr2: number;
  rr3: number;
  leverage: number;
  slPercent: number;
  slLossPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  tp1ProfitPercent: number;
  tp2ProfitPercent: number;
  tp3ProfitPercent: number;
  atr: number | null;
  timeframeMinutes: number;
  conditionsPassed: number;
  conditions: any[];
  experts: any[];
  expertsAgreed: number;
  confirmations: any;
  expertsPanel: any;
  scoreLabel: string;
}

interface MTFData {
  oneDay: Candle[];
  fourHour: Candle[];
  oneHour: Candle[];
  price: number | null;
  volumeRatio: number | null;
}

interface SignalInput {
  symbol: string;
  market: string;
  price: number;
  direction: "bullish" | "bearish" | "neutral";
  support: number | null;
  resistance: number | null;
  timeframeMinutes: number;
}

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

function toNum(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v;
}

/** Last element of a .calculate() result array, or undefined when empty. */
function lastOf<T>(series: T[] | null | undefined): T | undefined {
  return Array.isArray(series) && series.length > 0 ? series[series.length - 1] : undefined;
}

function getLastFinite<T>(series: (number | null | undefined)[], fallback: T): T {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
      return v as unknown as T;
    }
  }
  return fallback;
}

function computeIndicatorReport(candles: Candle[]): {
  rsi: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  atr14: number | null;
  volumeRatio: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  adx: number | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  obv: number | null;
} {
  if (!Array.isArray(candles) || candles.length < 30) {
    return { rsi: null, macd: null, atr14: null, volumeRatio: null, ema20: null, ema50: null, ema200: null, adx: null, bollingerUpper: null, bollingerLower: null, obv: null };
  }
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  let rsiVal: number | null = null;
  try { rsiVal = lastOf(RSI.calculate({ values: closes, period: 14 })) ?? null; } catch { }

  let macdVal: { line: number; signal: number; histogram: number } | null = null;
  try {
    const macdRes = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const last = macdRes && macdRes.length > 0 ? macdRes[macdRes.length - 1] : undefined;
    if (last) macdVal = { line: last.MACD ?? 0, signal: last.signal ?? 0, histogram: last.histogram ?? 0 };
  } catch { }

  const atr14 = toNum(lastOf(ATR.calculate({ high: highs, low: lows, close: closes, period: 14 })));
  const volumeRatio = volumes.length >= 20 ? (volumes[volumes.length - 1] / (volumes.slice(-20).reduce((a, b) => a + b, 0) / 20)) : null;

  const ema20 = toNum(lastOf(EMA.calculate({ values: closes, period: 20 })));
  const ema50 = toNum(lastOf(EMA.calculate({ values: closes, period: 50 })));
  const ema200 = toNum(lastOf(EMA.calculate({ values: closes, period: 200 })));

  const adxVal = toNum(lastOf(ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }))?.adx);
  const bb = lastOf(BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 }));
  const bollUpper = toNum(bb?.upper);
  const bollLower = toNum(bb?.lower);

  const obv = getLastFinite(
    candles.map((c, i) => {
      if (i === 0) return null;
      const prev = candles[i - 1];
      if (prev.close === undefined) return null;
      return c.close > prev.close ? c.volume : c.close < prev.close ? -c.volume : 0;
    }),
    null,
  );

  return {
    rsi: rsiVal, macd: macdVal, atr14, volumeRatio,
    ema20, ema50, ema200, adx: adxVal,
    bollingerUpper: bollUpper, bollingerLower: bollLower, obv,
  };
}