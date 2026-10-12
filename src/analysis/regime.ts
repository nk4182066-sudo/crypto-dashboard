import type { Candle, RegimeReport } from "./types";
import { atr, sma } from "./indicators";

/** Kaufman efficiency ratio: net move divided by total path travelled. */
export function efficiencyRatio(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 0;
  const window = closes.slice(-(period + 1));
  const net = Math.abs(window.at(-1)! - window[0]);
  let path = 0;
  for (let index = 1; index < window.length; index += 1) path += Math.abs(window[index] - window[index - 1]);
  return path === 0 ? 0 : net / path;
}

export function detectRegime(candles: Candle[]): RegimeReport {
  const closes = candles.map((candle) => candle.close);
  const er = efficiencyRatio(closes, 20);
  const atrSeries = atr(candles, 14).filter((value): value is number => value !== null);
  const price = closes.at(-1) ?? 0;

  const recentAtrPercent = atrSeries.length ? (atrSeries.at(-1)! / price) * 100 : 0;
  const sortedAtr = [...atrSeries].sort((first, second) => first - second);
  const medianAtr = sortedAtr.length ? sortedAtr[Math.floor(sortedAtr.length / 2)] : 0;
  const relativeVol = medianAtr === 0 ? 1 : atrSeries.at(-1)! / medianAtr;
  const volatility: RegimeReport["volatility"] = relativeVol > 1.35 ? "High" : relativeVol < 0.7 ? "Low" : "Normal";

  const sma200 = sma(closes, 200).at(-1) ?? null;
  const sma200Prior = sma(closes.slice(0, -20), 200).at(-1) ?? null;
  let cycle: RegimeReport["cycle"] = "Neutral";
  if (sma200 !== null) {
    if (price > sma200 && (sma200Prior === null || sma200 > sma200Prior)) cycle = "Bull";
    else if (price < sma200 && (sma200Prior === null || sma200 < sma200Prior)) cycle = "Bear";
  }

  const trending = er >= 0.35;
  const type: RegimeReport["type"] = trending ? "Trending" : "Ranging";
  const note = trending
    ? `Price is travelling directionally (efficiency ${(er * 100).toFixed(0)}%). Trend-following setups have the edge.`
    : `Price is chopping sideways (efficiency ${(er * 100).toFixed(0)}%). Mean-reversion near range edges works better than breakout chasing.`;

  return { type, volatility, cycle, efficiencyRatio: Number(er.toFixed(3)), note };
}
