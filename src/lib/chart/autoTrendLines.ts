import type { Candle } from "@/src/analysis/types";

// Auto trend line detection. Educational only.

/** A single anchor point on a trend line. */
export interface TrendPoint { time: number; price: number; }

export interface AutoTrendLines {
  /** Resistance line through the most recent peaks. */
  upperLine: [TrendPoint, TrendPoint];
  /** Support line through the most recent valleys. */
  lowerLine: [TrendPoint, TrendPoint];
  /** Median channel line between upper and lower. */
  middleLine: [TrendPoint, TrendPoint];
  trend: "up" | "down" | "sideways";
}

interface Extreme { time: number; price: number; }

/** Local peaks (kind "high") or valleys (kind "low") via a symmetric window. */
function extremes(candles: Candle[], kind: "high" | "low", lookback = 2): Extreme[] {
  const out: Extreme[] = [];
  for (let i = lookback; i < candles.length - lookback; i += 1) {
    const bar = candles[i];
    let ok = true;
    for (let j = i - lookback; j <= i + lookback && ok; j += 1) {
      if (j === i) continue;
      ok = kind === "high" ? candles[j].high <= bar.high : candles[j].low >= bar.low;
    }
    if (ok) out.push({ time: bar.time, price: kind === "high" ? bar.high : bar.low });
  }
  return out;
}

/** Line through the first & last pivot, extended to the window's start and end. */
function extend(pivots: Extreme[], startT: number, endT: number): [TrendPoint, TrendPoint] {
  const first = pivots[0];
  const last = pivots[pivots.length - 1];
  const slope = (last.price - first.price) / Math.max(1, last.time - first.time);
  return [
    { time: startT, price: first.price + slope * (startT - first.time) },
    { time: endT, price: last.price + slope * (endT - last.time) },
  ];
}

/** Flat fallback line when a side has fewer than two pivots. */
const flat = (startT: number, endT: number, price: number): [TrendPoint, TrendPoint] => [
  { time: startT, price },
  { time: endT, price },
];

/**
 * Scans the last 100 candles, connects the most recent peaks into the upper
 * line and valleys into the lower line, averages them into the middle channel
 * line, and classifies the channel slope as up / down / sideways.
 */
export function detectAutoTrendLines(candles: Candle[]): AutoTrendLines {
  const window = candles.slice(-100);
  if (window.length < 10) {
    const price = window.at(-1)?.close ?? 0;
    return { upperLine: flat(0, 0, price), lowerLine: flat(0, 0, price), middleLine: flat(0, 0, price), trend: "sideways" };
  }
  const startT = window[0].time;
  const endT = window[window.length - 1].time;

  const peaks = extremes(window, "high").slice(-3);
  const valleys = extremes(window, "low").slice(-3);

  const windowHigh = Math.max(...window.map((bar) => bar.high));
  const windowLow = Math.min(...window.map((bar) => bar.low));

  const upperLine = peaks.length >= 2 ? extend(peaks, startT, endT) : flat(startT, endT, windowHigh);
  const lowerLine = valleys.length >= 2 ? extend(valleys, startT, endT) : flat(startT, endT, windowLow);

  const middleLine: [TrendPoint, TrendPoint] = [
    { time: startT, price: (upperLine[0].price + lowerLine[0].price) / 2 },
    { time: endT, price: (upperLine[1].price + lowerLine[1].price) / 2 },
  ];

  const delta = middleLine[1].price - middleLine[0].price;
  const relative = middleLine[0].price === 0 ? 0 : delta / middleLine[0].price;
  const trend: "up" | "down" | "sideways" = relative > 0.005 ? "up" : relative < -0.005 ? "down" : "sideways";

  return { upperLine, lowerLine, middleLine, trend };
}