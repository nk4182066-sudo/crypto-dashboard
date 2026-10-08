import type { Candle, WyckoffReport } from "./types";
import { efficiencyRatio } from "./regime";

/** Wyckoff phase + Power of 3 (accumulation → manipulation → distribution) read. */
export function analyzeWyckoff(candles: Candle[]): WyckoffReport {
  const window = candles.slice(-120);
  if (window.length < 20) {
    return {
      phase: "Neutral",
      powerOf3: { accumulation: 33, manipulation: 34, distribution: 33 },
      note: "Not enough candles to classify a Wyckoff phase.",
    };
  }

  const closes = window.map((candle) => candle.close);
  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));
  const range = high - low || 1;
  const position = (closes.at(-1)! - low) / range;
  const er = efficiencyRatio(closes, 20);

  const firstHalf = window.slice(0, Math.floor(window.length / 2));
  const secondHalf = window.slice(Math.floor(window.length / 2));
  const rangeOf = (candles: Candle[]) =>
    Math.max(...candles.map((candle) => candle.high)) - Math.min(...candles.map((candle) => candle.low));
  const rangeExpanding = rangeOf(secondHalf) > rangeOf(firstHalf) * 1.1;
  const startPrice = closes[0];
  const endPrice = closes.at(-1)!;
  const change = (endPrice - startPrice) / startPrice;

  let phase: WyckoffReport["phase"] = "Neutral";
  if (er >= 0.35 && change > 0.05) phase = "Markup";
  else if (er >= 0.35 && change < -0.05) phase = "Markdown";
  else if (position < 0.4) phase = "Accumulation";
  else if (position > 0.6) phase = "Distribution";

  const lastCandle = window.at(-1)!;
  const span = Math.max(lastCandle.high - lastCandle.low, Number.EPSILON);
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const wicks = span - body;
  const manipulationRaw = Math.min(60, (wicks / span) * 60);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const accumulationRaw = lowerWick >= upperWick ? 40 : 25;
  const distributionRaw = Math.max(0, 100 - manipulationRaw - accumulationRaw);
  const total = manipulationRaw + accumulationRaw + distributionRaw;
  const powerOf3 = {
    accumulation: Math.round((accumulationRaw / total) * 100),
    manipulation: Math.round((manipulationRaw / total) * 100),
    distribution: Math.round((distributionRaw / total) * 100),
  };

  const notes: Record<WyckoffReport["phase"], string> = {
    Accumulation: "Price is grinding in the lower part of its range while progress stalls — classic accumulation. Spring/signal-chase entries wait for a break of the range high with volume.",
    Markup: "Higher highs and higher lows with directional efficiency — the markup phase. Buy pullbacks to demand zones instead of chasing expansion candles.",
    Distribution: "Price is rotating in the upper part of its range without net progress — distribution. Expect a spring to the downside; trim longs into strength.",
    Markdown: "Directional selling with lower highs and lower lows — markdown. Only counter-trend trades with strict stops belong here.",
    Neutral: "Structure is mixed: no clear Wyckoff cause has been built yet. Trade the range extremes or wait.",
  };

  return {
    phase,
    powerOf3,
    note: `${notes[phase]}${rangeExpanding ? " Ranges are expanding, which usually marks the markup/markdown (cause-to-effect) stage." : " Ranges are contracting, which usually marks cause-building (accumulation/distribution)."}`,
  };
}
