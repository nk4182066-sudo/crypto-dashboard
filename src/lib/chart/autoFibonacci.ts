import type { Candle } from "@/src/analysis/types";

// Fibonacci retracement levels. Educational only.

export interface FibLevel {
  ratio: number;
  price: number;
  label: string;
}

export interface AutoFibonacci {
  levels: FibLevel[];
  high: number;
  low: number;
  /** "up" when the window's high came after its low (recent swing is up). */
  direction: "up" | "down";
}

/** Standard retracement ratios, 0 = swing low, 1 = swing high. */
const RATIOS: { ratio: number; label: string }[] = [
  { ratio: 0, label: "0.0 (Low)" },
  { ratio: 0.236, label: "0.236" },
  { ratio: 0.382, label: "0.382" },
  { ratio: 0.5, label: "0.5" },
  { ratio: 0.618, label: "0.618 (Golden Ratio)" },
  { ratio: 0.786, label: "0.786" },
  { ratio: 1, label: "1.0 (High)" },
];

/**
 * Highest high / lowest low of the last `lookback` candles become the swing
 * extremes; every level is priced as low + ratio * (high - low). Direction
 * follows which extreme occurred more recently.
 */
export function detectAutoFibonacci(candles: Candle[], lookback = 100): AutoFibonacci {
  const window = candles.slice(-lookback);
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let highIndex = 0;
  let lowIndex = 0;
  window.forEach((bar, index) => {
    if (bar.high > high) { high = bar.high; highIndex = index; }
    if (bar.low < low) { low = bar.low; lowIndex = index; }
  });
  if (!Number.isFinite(high) || !Number.isFinite(low) || high < low) {
    const price = window.at(-1)?.close ?? 0;
    high = price;
    low = price;
  }
  const direction: "up" | "down" = highIndex >= lowIndex ? "up" : "down";
  const span = high - low;
  const levels = RATIOS.map(({ ratio, label }) => ({ ratio, price: low + ratio * span, label }));
  return { levels, high, low, direction };
}