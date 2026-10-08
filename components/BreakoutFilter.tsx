// Educational analysis only. Not financial advice.
import React from "react";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Breakout {
  type: "real" | "fake";
  direction: "up" | "down";
  price: number;
  confidence: number; // 0-100
}

interface BreakoutFilterProps {
  candles: Candle[];
  currentPrice: number;
}

const LOOKBACK = 20; // candles used to build support / resistance
const WINDOW = 50; // detect breakouts in the last 50 candles

// Classifies breakouts: REAL = high volume + strong close (close > open for up),
// FAKE = low volume + weak close (long wick, small body).
function detectBreakouts(candles: Candle[], currentPrice: number): Breakout[] {
  const recent = candles.slice(-WINDOW);
  const results: Breakout[] = [];

  for (let i = LOOKBACK; i < recent.length; i++) {
    const candle = recent[i];
    const prior = recent.slice(Math.max(0, i - LOOKBACK), i);
    const resistance = Math.max(...prior.map((c) => c.high));
    const support = Math.min(...prior.map((c) => c.low));
    const body = Math.abs(candle.close - candle.open);

    let direction: "up" | "down" | null = null;
    if (candle.close > resistance && candle.close > candle.open) direction = "up";
    else if (candle.close < support && candle.close < candle.open) direction = "down";
    if (!direction) continue;

    const avgVolume =
      prior.reduce((sum, c) => sum + c.volume, 0) / (prior.length || 1);
    const volumeRatio = avgVolume > 0 ? candle.volume / avgVolume : 1;
    const bodyPct = candle.high > candle.low ? body / (candle.high - candle.low) : 0;
    // Long wick = small body = lower score. High volume + strong body = higher.
    const strength = Math.min(100, (volumeRatio / 1.5) * 50 + bodyPct * 50);
    const confidence = Math.round(Math.max(0, Math.min(100, strength)));

    results.push({
      type: confidence >= 50 ? "real" : "fake",
      direction,
      price: direction === "up" ? resistance : support,
      confidence,
    });
  }

  // Keep only breakouts still relevant to the current price.
  return results
    .filter((b) => (b.direction === "up" ? currentPrice >= b.price : currentPrice <= b.price))
    .slice(-5);
}

const BreakoutFilter: React.FC<BreakoutFilterProps> = ({ candles, currentPrice }) => {
  const breakouts = React.useMemo(
    () => detectBreakouts(candles, currentPrice),
    [candles, currentPrice]
  );

  // Part B will render breakouts on the chart; logic only for now.
  void breakouts;
  return null;
};

export { detectBreakouts };
export default BreakoutFilter;
