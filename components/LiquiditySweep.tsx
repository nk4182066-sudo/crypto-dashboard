// Educational analysis only. Not financial advice.
import React from "react";

export interface Sweep {
  type: "sweep_high" | "sweep_low";
  price: number;
  time: number;
  confidence: number; // 0-100
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LiquiditySweepProps {
  candles: Candle[];
}

// Detect liquidity sweeps (stop hunts) in the last 30 candles.
// Sweep High: high breaks previous high but close stays below (bull trap).
// Sweep Low: low breaks previous low but close stays above (bear trap).
function detectSweeps(candles: Candle[]): Sweep[] {
  const start = Math.max(1, candles.length - 30);
  const sweeps: Sweep[] = [];

  for (let i = start; i < candles.length; i++) {
    const candle = candles[i];
    const prev = candles[i - 1];

    const isSweepHigh = candle.high > prev.high && candle.close < prev.high;
    const isSweepLow = candle.low < prev.low && candle.close > prev.low;
    if (!isSweepHigh && !isSweepLow) continue;

    // Confidence from volume + wick: strong volume and long wick = High
    // (70-100), normal = Medium (40-70), weak = Low (0-40).
    const lookback = candles.slice(Math.max(0, i - 10), i);
    const avgVolume =
      lookback.reduce((sum, c) => sum + c.volume, 0) / (lookback.length || 1);
    const volumeRatio = avgVolume > 0 ? candle.volume / avgVolume : 1;
    const volumeScore = Math.min(100, (volumeRatio / 1.5) * 100);

    const candleRange = candle.high - candle.low;
    const wick = isSweepHigh ? candle.high - candle.close : candle.close - candle.low;
    const wickPct = candleRange > 0 ? wick / candleRange : 0;
    const wickScore = Math.min(100, (wickPct / 0.6) * 100);

    const confidence = Math.round(
      Math.max(0, Math.min(100, (volumeScore + wickScore) / 2))
    );

    sweeps.push({
      type: isSweepHigh ? "sweep_high" : "sweep_low",
      price: isSweepHigh ? candle.high : candle.low,
      time: candle.time,
      confidence,
    });
  }

  return sweeps;
}

const LiquiditySweep: React.FC<LiquiditySweepProps> = ({ candles }) => {
  const sweeps = React.useMemo(() => detectSweeps(candles), [candles]);

  // "Sweep detected" events are logged here; visuals come in Part B.
  if (process.env.NODE_ENV === "development" && sweeps.length > 0) {
    console.log(`Sweep detected x${sweeps.length}`);
  }

  return null;
};

export { detectSweeps };
export default LiquiditySweep;
