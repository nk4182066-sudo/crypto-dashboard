import type { Candle, FibonacciReport, FibonacciLevel, TrendBias } from "./types";
import { zigZag } from "./structure";

const RETRACEMENTS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const EXTENSIONS = [1.272, 1.618, 2.0, 2.618];
const FAN_RATIOS = [0.382, 0.5, 0.618];

export function analyzeFibonacci(candles: Candle[]): FibonacciReport {
  const window = candles.slice(-200);
  const high = window.length ? Math.max(...window.map((candle) => candle.high)) : 0;
  const low = window.length ? Math.min(...window.map((candle) => candle.low)) : 0;
  const range = high - low;

  const pivots = zigZag(candles, 3);
  const lastHigh = [...pivots].reverse().find((point) => point.kind === "high");
  const lastLow = [...pivots].reverse().find((point) => point.kind === "low");
  const swingHigh = lastHigh?.price ?? high;
  const swingLow = lastLow?.price ?? low;
  const trend: TrendBias = lastHigh && lastLow && lastHigh.time > lastLow.time ? "Bullish" : "Bearish";

  const size = Math.abs(swingHigh - swingLow) || range || 1;
  const label = (ratio: number) => `${(ratio * 100).toFixed(ratio === 0 || ratio === 1 ? 0 : 1)}%`;

  const retracement: FibonacciLevel[] = trend === "Bullish"
    ? RETRACEMENTS.map((ratio) => ({ label: `Retrace ${label(ratio)}`, ratio, price: swingHigh - size * ratio }))
    : RETRACEMENTS.map((ratio) => ({ label: `Retrace ${label(ratio)}`, ratio, price: swingLow + size * ratio }));

  const extension: FibonacciLevel[] = trend === "Bullish"
    ? EXTENSIONS.map((ratio) => ({ label: `Extension ${label(ratio)}`, ratio, price: swingHigh + size * (ratio - 1) }))
    : EXTENSIONS.map((ratio) => ({ label: `Extension ${label(ratio)}`, ratio, price: swingLow - size * (ratio - 1) }));

  // Fan: diagonal lines from the swing origin through each retracement level,
  // projected to the latest bar using the pivot index distance as the time base.
  const originIndex = trend === "Bullish" ? lastLow?.index ?? 0 : lastHigh?.index ?? 0;
  const endIndex = trend === "Bullish" ? lastHigh?.index ?? 1 : lastLow?.index ?? 1;
  const lastIndex = candles.length - 1;
  const span = Math.max(1, endIndex - originIndex);
  const fan: FibonacciLevel[] = FAN_RATIOS.map((ratio) => {
    const anchorPrice = trend === "Bullish" ? swingHigh - size * ratio : swingLow + size * ratio;
    const slope = (anchorPrice - (trend === "Bullish" ? swingLow : swingHigh)) / span;
    return {
      label: `Fan ${label(ratio)}`,
      ratio,
      price: (trend === "Bullish" ? swingLow : swingHigh) + slope * Math.max(0, lastIndex - originIndex),
    };
  });

  const goldenLow = trend === "Bullish" ? swingHigh - size * 0.705 : swingLow + size * 0.618;
  const goldenHigh = trend === "Bullish" ? swingHigh - size * 0.618 : swingLow + size * 0.705;
  const goldenPocket = { low: Math.min(goldenLow, goldenHigh), high: Math.max(goldenLow, goldenHigh) };

  const price = window.at(-1)?.close ?? 0;
  const insidePocket = price >= goldenPocket.low && price <= goldenPocket.high;

  return {
    swingHigh,
    swingLow,
    trend,
    retracement,
    extension,
    fan,
    goldenPocket,
    note: `${trend} swing from ${swingLow.toFixed(swingLow < 1 ? 6 : 2)} to ${swingHigh.toFixed(swingHigh < 1 ? 6 : 2)}. ${insidePocket ? "Price is inside the golden pocket (0.618–0.705) — the highest-probability pullback zone for trend continuation entries." : "Price is outside the golden pocket; wait for a pullback into 0.618–0.705 before trusting a retracement entry. Fan lines are diagonal supports projected from the swing origin."}`,
  };
}
