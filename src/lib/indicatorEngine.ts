// indicatorEngine.ts — KAAM 4: the 10-indicator institutional panel.
//
// The old card showed only 4 confirmations (RSI/MACD/EMA/Volume). This engine
// computes the full 10-indicator set a hedge-fund analyst reads, each with a
// display value, a status, a one-line interpretation and which side of the
// market it supports. Pure + synchronous + defensive (never throws) so the
// Signals page renders every row instantly with no second network call.
//
//   1. RSI (14)             oversold / overbought + extreme
//   2. MACD (12, 26, 9)     crossover + histogram
//   3. EMA (20 / 50 / 200)  perfect alignment
//   4. Volume (20 MA)       150%+ surge above the 20-period average
//   5. ATR (14)             volatility for stop sizing
//   6. Bollinger (20, 2)    squeeze detection
//   7. Stochastic (14,3,3)  %K vs %D crossover
//   8. ADX (14)             trend strength (>25 = strong)
//   9. Fibonacci            nearest 38.2 / 50 / 61.8 retracement
//  10. Pivot Points         S1 / S2 / R1 / R2 vs price
//
// Every raw math function is reused from @/src/analysis/indicators — this file
// only assembles + interprets them. Educational analysis only, not advice.

import type { Candle } from "@/src/analysis/types";
import { adx, atr, bollinger, ema, macd, pivotPoints, rsi, sma } from "@/src/analysis/indicators";
import { zigZag } from "@/src/analysis/structure";

export type IndicatorSide = "bullish" | "bearish" | "neutral";
export type IndicatorIcon = "confirm" | "weak" | "against";

/** One display-ready indicator row for the 10-indicator panel. */
export interface IndicatorRow {
  id: string;
  name: string;
  /** Formatted numeric value (e.g. "28.5", "$0.1172", "+180%"). */
  value: string;
  /** Short status word (e.g. "Oversold", "Bullish Crossover", "Squeeze"). */
  status: string;
  /** One-line interpretation of what the reading means. */
  interpretation: string;
  /** Which side of the market this reading supports. */
  side: IndicatorSide;
  /** True when this reading agrees with the setup direction. */
  confirms: boolean;
  icon: IndicatorIcon;
}

export interface IndicatorInput {
  candles: Candle[];
  /** The setup direction the panel is judged against. */
  direction: IndicatorSide;
}

/** Last finite value of a series, or null. */
function lastOf(series: (number | null)[]): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

/** Format a price/value to sensible precision for its magnitude. */
function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(5);
}

/** Wrap a reading into a display row, deriving side/icon against the direction. */
function row(
  id: string,
  name: string,
  value: string,
  status: string,
  interpretation: string,
  side: IndicatorSide,
  direction: IndicatorSide,
): IndicatorRow {
  const confirms = side !== "neutral" && (side === direction || direction === "neutral");
  const icon: IndicatorIcon = confirms ? "confirm" : side === "neutral" ? "weak" : "against";
  return { id, name, value, status, interpretation, side, confirms, icon };
}


/** Plain Stochastic oscillator (14,3,3) %K / %D — not stochastic-RSI. */
function stochastic(candles: Candle[], period = 14, smoothK = 3, smoothD = 3): { k: number; d: number } | null {
  if (candles.length < period + smoothD) return null;
  const raw: (number | null)[] = candles.map((_, index) => {
    if (index < period - 1) return null;
    const window = candles.slice(index - period + 1, index + 1);
    const lowest = Math.min(...window.map((c) => c.low));
    const highest = Math.max(...window.map((c) => c.high));
    if (highest === lowest) return 50;
    return ((candles[index].close - lowest) / (highest - lowest)) * 100;
  });
  // sma() expects a dense number[]; compact the null warm-up, then smooth.
  const compact = raw.flatMap((value) => (value === null ? [] : [value]));
  const kSeries = sma(compact, smoothK);
  const dSeries = sma(kSeries.flatMap((value) => (value === null ? [] : [value])), smoothD);
  const k = lastOf(kSeries);
  const d = lastOf(dSeries);
  if (k === null || d === null) return null;
  return { k, d };
}

/** Nearest Fibonacci retracement level (38.2 / 50 / 61.8) to the current price. */
function fibonacci(candles: Candle[], period = 90): {
  levels: { ratio: string; price: number }[];
  nearest: { ratio: string; price: number; distancePct: number };
  position: "discount" | "premium" | "mid";
} | null {
  const window = candles.slice(-period);
  if (window.length < 10) return null;
  const price = window[window.length - 1].close;
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  const pivots = zigZag(window, 3);
  if (pivots.length >= 2) {
    for (const pivot of pivots) {
      if (pivot.kind === "high") swingHigh = Math.max(swingHigh, pivot.price);
      else swingLow = Math.min(swingLow, pivot.price);
    }
  }
  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) {
    swingHigh = Math.max(...window.map((c) => c.high));
    swingLow = Math.min(...window.map((c) => c.low));
  }
  const range = swingHigh - swingLow;
  if (!(range > 0)) return null;
  // Retracement measured from the swing high downward (pullback levels).
  const defs: [string, number][] = [
    ["38.2%", 0.382],
    ["50%", 0.5],
    ["61.8%", 0.618],
  ];
  const levels = defs.map(([ratio, r]) => ({ ratio, price: swingHigh - range * r }));
  let nearest = levels[0];
  let minDist = Math.abs(price - levels[0].price);
  for (const level of levels.slice(1)) {
    const dist = Math.abs(price - level.price);
    if (dist < minDist) {
      minDist = dist;
      nearest = level;
    }
  }
  const distancePct = price > 0 ? (minDist / price) * 100 : 0;
  const relative = (swingHigh - price) / range; // 0 = at high, 1 = at low
  const position: "discount" | "premium" | "mid" =
    relative >= 0.62 ? "discount" : relative <= 0.38 ? "premium" : "mid";
  return { levels, nearest: { ...nearest, distancePct }, position };
}

/**
 * Compute the 10-indicator panel from real candles. Each row carries a value,
 * status, interpretation and which side it supports; `confirms`/`icon` are
 * derived against the setup direction. Never throws — a missing indicator
 * degrades to a neutral "no data" row instead of failing the whole panel.
 */
export function calculateIndicators(input: IndicatorInput): IndicatorRow[] {
  const { candles, direction } = input;
  if (!Array.isArray(candles) || candles.length < 3) return [];
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const price = closes[closes.length - 1];
  const rows: IndicatorRow[] = [];

  // 1) RSI (14) ────────────────────────────────────────────────────────────
  {
    const value = lastOf(rsi(closes, 14));
    if (value === null) {
      rows.push(row("rsi", "RSI (14)", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const side: IndicatorSide = value < 35 ? "bullish" : value > 65 ? "bearish" : "neutral";
      const status = value < 30 ? "Oversold" : value > 70 ? "Overbought" : value < 45 ? "Low" : value > 55 ? "High" : "Neutral";
      rows.push(
        row(
          "rsi",
          "RSI (14)",
          value.toFixed(1),
          status,
          side === "bullish"
            ? "Oversold — reversal-buy zone."
            : side === "bearish"
              ? "Overbought — reversal-sell zone."
              : "Mid-range — momentum balanced.",
          side,
          direction,
        ),
      );
    }
  }

  // 2) MACD (12, 26, 9) ─────────────────────────────────────────────────────
  {
    const m = closes.length > 26 ? macd(closes) : null;
    if (!m) {
      rows.push(row("macd", "MACD (12,26,9)", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const side: IndicatorSide = m.line > m.signal ? "bullish" : "bearish";
      const expanding = Math.abs(m.histogram) > 0;
      rows.push(
        row(
          "macd",
          "MACD (12,26,9)",
          m.line.toFixed(4),
          side === "bullish" ? "Bullish Crossover" : "Bearish Crossover",
          `Line ${side === "bullish" ? "above" : "below"} signal, histogram ${expanding ? "expanding" : "flat"}.`,
          side,
          direction,
        ),
      );
    }
  }

  // 3) EMA (20 / 50 / 200) ──────────────────────────────────────────────────
  {
    const e20 = lastOf(ema(closes, 20));
    const e50 = lastOf(ema(closes, 50));
    const e200 = lastOf(ema(closes, 200));
    if (e20 === null || e50 === null) {
      rows.push(row("ema", "EMA (20/50/200)", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const bull = price > e20 && e20 > e50 && (e200 === null || e50 > e200);
      const bear = price < e20 && e20 < e50 && (e200 === null || e50 < e200);
      const side: IndicatorSide = bull ? "bullish" : bear ? "bearish" : "neutral";
      rows.push(
        row(
          "ema",
          "EMA (20/50/200)",
          `${fmtNum(e20)} / ${fmtNum(e50)}${e200 !== null ? ` / ${fmtNum(e200)}` : ""}`,
          side === "bullish" ? "Perfect Bullish Stack" : side === "bearish" ? "Perfect Bearish Stack" : "Mixed",
          side === "neutral"
            ? "EMAs not perfectly aligned."
            : `Price ${side === "bullish" ? "above" : "below"} the full EMA stack.`,
          side,
          direction,
        ),
      );
    }
  }

  // 4) Volume (20 MA) ──────────────────────────────────────────────────────
  {
    const window = volumes.slice(-20);
    const avg = window.length > 0 ? window.reduce((a, b) => a + (b ?? 0), 0) / window.length : 0;
    const last = volumes[volumes.length - 1] ?? 0;
    const ratio = avg > 0 ? last / avg : 0;
    const surge = ratio > 1.5;
    const side: IndicatorSide = surge ? direction : "neutral";
    rows.push(
      row(
        "volume",
        "Volume (20 MA)",
        avg > 0 ? `+${Math.round((ratio - 1) * 100)}%` : "—",
        surge ? "Above Average" : ratio >= 0.8 ? "Normal" : "Below Average",
        surge
          ? `${ratio.toFixed(2)}x the 20-period average — participation strong.`
          : `${ratio.toFixed(2)}x average — needs >1.5x to confirm.`,
        side,
        direction,
      ),
    );
  }

  // 5) ATR (14) ────────────────────────────────────────────────────────────
  {
    const value = lastOf(atr(candles, 14));
    if (value === null || value <= 0) {
      rows.push(row("atr", "ATR (14)", "—", "No data", "Volatility unmeasurable.", "neutral", direction));
    } else {
      const atrPct = price > 0 ? (value / price) * 100 : 0;
      const status = atrPct > 6 ? "High Volatility" : atrPct < 1 ? "Low Volatility" : "Normal Volatility";
      rows.push(
        row(
          "atr",
          "ATR (14)",
          `${fmtNum(value)} (${atrPct.toFixed(2)}%)`,
          status,
          `Stop sized at ~${(value * 1.5).toFixed(5)} (1.5x ATR) from entry.`,
          "neutral",
          direction,
        ),
      );
    }
  }


  // 6) Bollinger Bands (20, 2) ──────────────────────────────────────────────
  {
    const bb = closes.length >= 20 ? bollinger(closes, 20, 2) : null;
    if (!bb) {
      rows.push(row("bollinger", "Bollinger (20,2)", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const squeeze = bb.widthPercent < 4;
      const nearLower = price <= bb.lower + (bb.middle - bb.lower) * 0.25;
      const nearUpper = price >= bb.upper - (bb.upper - bb.middle) * 0.25;
      const side: IndicatorSide = squeeze ? "neutral" : nearLower ? "bullish" : nearUpper ? "bearish" : "neutral";
      rows.push(
        row(
          "bollinger",
          "Bollinger (20,2)",
          `${bb.widthPercent.toFixed(2)}% width`,
          squeeze ? "Squeeze → Breakout" : nearLower ? "At Lower Band" : nearUpper ? "At Upper Band" : "Mid-Band",
          squeeze
            ? "Bands compressed — breakout expected."
            : `Bands ${fmtNum(bb.lower)} – ${fmtNum(bb.upper)}.`,
          side,
          direction,
        ),
      );
    }
  }

  // 7) Stochastic (14, 3, 3) ────────────────────────────────────────────────
  {
    const st = stochastic(candles, 14, 3, 3);
    if (!st) {
      rows.push(row("stochastic", "Stochastic (14,3,3)", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const side: IndicatorSide = st.k > st.d ? "bullish" : "bearish";
      const zone = st.k < 20 ? "Oversold" : st.k > 80 ? "Overbought" : "Neutral";
      rows.push(
        row(
          "stochastic",
          "Stochastic (14,3,3)",
          `K ${st.k.toFixed(1)} · D ${st.d.toFixed(1)}`,
          `${side === "bullish" ? "Bullish" : "Bearish"} Crossover · ${zone}`,
          `%K ${st.k > st.d ? "above" : "below"} %D.`,
          side,
          direction,
        ),
      );
    }
  }

  // 8) ADX (14) ────────────────────────────────────────────────────────────
  {
    const a = closes.length >= 28 ? adx(candles, 14) : null;
    if (!a) {
      rows.push(row("adx", "ADX (14)", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const strong = a.adx >= 25;
      const side: IndicatorSide = !strong ? "neutral" : a.plusDI > a.minusDI ? "bullish" : "bearish";
      rows.push(
        row(
          "adx",
          "ADX (14)",
          a.adx.toFixed(1),
          strong ? "Strong Trend" : "Weak / Range",
          strong
            ? `Trending (+DI ${a.plusDI.toFixed(0)} / -DI ${a.minusDI.toFixed(0)}).`
            : "No trend — avoid breakout trades.",
          side,
          direction,
        ),
      );
    }
  }

  // 9) Fibonacci Retracement ────────────────────────────────────────────────
  {
    const fib = fibonacci(candles, 90);
    if (!fib) {
      rows.push(row("fibonacci", "Fibonacci", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const nearLevel = fib.nearest.distancePct < 1.5;
      // In a discount (price low in range) a long is favoured; premium favours a short.
      const side: IndicatorSide = !nearLevel
        ? "neutral"
        : fib.position === "discount"
          ? "bullish"
          : fib.position === "premium"
            ? "bearish"
            : "neutral";
      rows.push(
        row(
          "fibonacci",
          "Fibonacci",
          `${fib.nearest.ratio} @ ${fmtNum(fib.nearest.price)}`,
          `Price at ${fib.position}`,
          `Nearest retracement ${fib.nearest.ratio} (${fib.nearest.distancePct.toFixed(2)}% away).`,
          side,
          direction,
        ),
      );
    }
  }

  // 10) Pivot Points (classic) ──────────────────────────────────────────────
  {
    const piv = candles.length >= 2 ? pivotPoints(candles, "classic") : null;
    if (!piv) {
      rows.push(row("pivot", "Pivot Points", "—", "No data", "Not enough candles.", "neutral", direction));
    } else {
      const side: IndicatorSide = price > piv.pivot ? "bullish" : price < piv.pivot ? "bearish" : "neutral";
      rows.push(
        row(
          "pivot",
          "Pivot Points",
          `S1 ${fmtNum(piv.s1)} · R1 ${fmtNum(piv.r1)}`,
          price > piv.pivot ? "Above Pivot" : "Below Pivot",
          `Pivot ${fmtNum(piv.pivot)}; S2 ${fmtNum(piv.s2)}, R2 ${fmtNum(piv.r2)}.`,
          side,
          direction,
        ),
      );
    }
  }

  return rows;
}

/** Count of the 10 indicators that agree with the setup direction. */
export function indicatorsAgreed(rows: IndicatorRow[]): number {
  return rows.filter((r) => r.confirms).length;
}
